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

/**
 * Google のタグの ID を決める。
 * 1. 環境変数 GTM_ID があれば、その値 (GitHub Actions では vars.GTM_ID をわたす)
 * 2. なければ、config.js（または public/config.js）に書かれた GTM_ID
 * どちらもなければタグは埋め込まない。
 */
export function readGtmId(): string {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const envVal = (proc?.env?.GTM_ID ?? '').trim();
  const value = envVal || readFromConfigJs('GTM_ID');
  // 未設定またはサンプルのプレースホルダー G-XXXXXXXXXX のときは埋め込まない
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
  server: {
    port: 5173,
    host: true,
  },
});
