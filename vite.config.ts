import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, HtmlTagDescriptor, Plugin } from 'vite';

/** プロジェクト直下の config.js または public/config.js に書かれた `名前 = '値'` を読む (実行はせず、文字として読み取る) */
function readFromConfigJs(name: string): string {
  const candidates = ['./config.js', './public/config.js'];
  for (const relPath of candidates) {
    const file = fileURLToPath(new URL(relPath, import.meta.url));
    if (!existsSync(file)) continue;
    const match = readFileSync(file, 'utf8').match(
      new RegExp(`\\b${name}\\b\\s*[:=]\\s*(['"\`])(.*?)\\1`)
    );
    if (match && match[2].trim()) {
      return match[2].trim();
    }
  }
  return '';
}

function getEnv(name: string): string {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return (proc?.env?.[name] ?? '').trim();
}

/**
 * Firebase の設定 (Google ログインと Firestore への保存に使う)。
 * 環境変数があればその値、なければ config.js の値を使う。4つそろっていなければ null で、
 * そのときはログインの入り口を出さず、Firebase のコードも読みこまれない。
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID
 */
export function readFirebaseConfig(): Record<string, string> | null {
  if (getEnv('FIREBASE_DISABLED') === '1') return null;
  const get = (name: string) => getEnv(name) || readFromConfigJs(name);
  const config = {
    apiKey: get('FIREBASE_API_KEY'),
    authDomain: get('FIREBASE_AUTH_DOMAIN'),
    projectId: get('FIREBASE_PROJECT_ID'),
    appId: get('FIREBASE_APP_ID'),
  };
  const filled = Object.values(config).filter(Boolean).length;
  if (filled === 0) return null;
  if (filled < 4) {
    throw new Error(
      'Firebase の設定が足りません。FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID の4つを入れてください'
    );
  }
  const databaseURL = get('FIREBASE_DATABASE_URL').replace(/\/+$/, '');
  if (databaseURL && !/^https?:\/\/[\w.:-]+$/.test(databaseURL)) {
    throw new Error(
      `FIREBASE_DATABASE_URL の形式が正しくありません: "${databaseURL}" (https://….firebasedatabase.app など)`
    );
  }
  return databaseURL ? { ...config, databaseURL } : config;
}

/**
 * Google のタグの ID を決める。
 * 1. 環境変数 GTM_ID があれば、その値 (GitHub Actions では vars.GTM_ID をわたす)
 * 2. なければ、config.js（または public/config.js）に書かれた GTM_ID
 * どちらもなければタグは埋め込まない。
 */
export function readGtmId(): string {
  const value = getEnv('GTM_ID') || readFromConfigJs('GTM_ID');
  if (!value || value === 'G-XXXXXXXXXX') return '';
  if (!/^(GTM|G)-[A-Z0-9]+$/.test(value)) {
    throw new Error(`GTM_ID の形式が正しくありません: "${value}" (G-XXXXXXXXXX または GTM-XXXXXXX)`);
  }
  return value;
}

/** G-… なら Google アナリティクス (gtag.js)、GTM-… なら Google タグ マネージャーのタグ */
export function googleTags(id: string): HtmlTagDescriptor[] {
  if (id.startsWith('GTM-')) {
    return [
      {
        tag: 'script',
        injectTo: 'head-prepend',
        children:
          "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
          "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;" +
          "j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);" +
          `})(window,document,'script','dataLayer','${id}');`,
      },
      {
        tag: 'noscript',
        injectTo: 'body-prepend',
        children: `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
      },
    ];
  }
  return [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
    },
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`,
    },
  ];
}

/** ID があるときだけ、index.html に Google のタグを入れる */
function googleTagPlugin(id: string): Plugin {
  return {
    name: 'math-solids-lab-google-tag',
    transformIndexHtml: () => (id ? googleTags(id) : []),
  };
}

export default defineConfig({
  base: './',
  plugins: [googleTagPlugin(readGtmId())],
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(readFirebaseConfig()),
    __FIREBASE_EMULATOR__: JSON.stringify(getEnv('FIREBASE_EMULATOR') === '1'),
  },
  server: {
    port: 5173,
    host: true,
  },
});
