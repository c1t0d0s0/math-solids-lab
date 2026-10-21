// このファイルを config.js（または public/config.js）という名前でコピーして、値を書きかえる (config.js は Git に入れない)。
// どれも入れなくても動く。値はビルドのときに読むので、変えたら npm run dev / npm run build をやり直す。
// GitHub Pages に公開するときは、同じ名前のリポジトリ変数 (Settings → Variables) の値が使われる。

// Google アナリティクスの ID (G-…) または Google タグ マネージャーの ID (GTM-…)。入れると、Google のタグをページに埋め込む
const GTM_ID = 'G-XXXXXXXXXX';

// Firebase のウェブアプリの設定。4つとも入れると、Google ログインと Firestore への保存が使えるようになる。
// 入れなければ、ログインの入り口は出ず、記録は今までどおりブラウザ (localStorage) だけに保存する。
// これらの値は公開されてもよいもの (記録を守るのは firestore.rules のほう)。
const FIREBASE_API_KEY = '';
const FIREBASE_AUTH_DOMAIN = '';
const FIREBASE_PROJECT_ID = '';
const FIREBASE_APP_ID = '';

// Realtime Database の URL (任意)。
const FIREBASE_DATABASE_URL = '';
