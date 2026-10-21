export type GradeFilterId = 'all' | 'low' | 'mid' | 'high';

export interface GradeTab {
  id: GradeFilterId;
  label: string;
}

export const GRADES: GradeTab[] = [
  { id: 'all', label: 'すべて' },
  { id: 'low', label: '1・2年生' },
  { id: 'mid', label: '3・4年生' },
  { id: 'high', label: '5・6年生' },
];

export type ModeId =
  | 'g12-stamper'
  | 'g12-sticker'
  | 'g34-judge'
  | 'g34-notebook'
  | 'g34-vertex'
  | 'g56-craft'
  | 'g56-revolve'
  | 'g56-cutter'
  | 'sandbox';

export interface ModeMeta {
  id: ModeId;
  groupKind: 'g12' | 'g34' | 'g56' | 'sandbox';
  title: string;
  badge: string;
  desc: string;
  grades: GradeFilterId[];
  goalCount: number;
  unit: string;
}

export const MODE_GROUPS = [
  {
    kind: 'g12' as const,
    title: '1・2年生　はこパズル・スタンパー',
    note: 'さいころや箱をころがしてスタンプを押したり、動物シールを貼って反対側の面をあてよう。',
  },
  {
    kind: 'g34' as const,
    title: '3・4年生　立方体ビルダー & まちがい探し',
    note: '展開図がちゃんとした立方体になるか予想したり、全11パターンの展開図や重なる頂点を探そう。',
  },
  {
    kind: 'g56' as const,
    title: '5・6年生　立体クラフト & ぐるぐる回転体',
    note: '円柱や角錐の展開図、コマのように回して作る回転体、立体をスパッと切る切断面を観察しよう。',
  },
  {
    kind: 'sandbox' as const,
    title: '全学年　じゆうさくせい（サンドボックス）',
    note: '方眼ノートの上に好きなだけ面をならべて、自分だけのオリジナル展開図をデザインして組み立てよう。',
  },
];

export const MODES: ModeMeta[] = [
  {
    id: 'g12-stamper',
    groupKind: 'g12',
    title: 'はこころがし・スタンパー',
    badge: '1・2年',
    desc: '箱をパタンパタンと転がして、床に絵の具のスタンプを押して展開図をつくろう',
    grades: ['low'],
    goalCount: 3,
    unit: 'ステージ',
  },
  {
    id: 'g12-sticker',
    groupKind: 'g12',
    title: 'さいころ動物シールあて',
    badge: '1・2年',
    desc: '開いた面に動物シールを貼って、箱にしたとき「反対側にくる動物」を当てよう',
    grades: ['low'],
    goalCount: 5,
    unit: '問正解',
  },
  {
    id: 'g34-judge',
    groupKind: 'g34',
    title: '組み立て判定ゲーム',
    badge: '3・4年',
    desc: 'この展開図は「立方体になる⭕」？「重なって失敗する❌」？スライダーで確かめよう',
    grades: ['mid'],
    goalCount: 6,
    unit: '問正解',
  },
  {
    id: 'g34-notebook',
    groupKind: 'g34',
    title: '11パターン収集手帳',
    badge: '3・4年',
    desc: '立方体の展開図は全部で11種類！パズル感覚で探して展開図ずかんを埋めよう',
    grades: ['mid'],
    goalCount: 11,
    unit: '種類発見',
  },
  {
    id: 'g34-vertex',
    groupKind: 'g34',
    title: '頂点・辺マッチング',
    badge: '3・4年',
    desc: '立体に組み立てたとき、「赤い点Aと重なる点」はどれかな？タップで当てよう',
    grades: ['mid'],
    goalCount: 5,
    unit: '問正解',
  },
  {
    id: 'g56-craft',
    groupKind: 'g56',
    title: '曲面・多角形の展開図',
    badge: '5・6年',
    desc: '円柱の長方形がくるっと丸まる！円柱・円錐・角柱・角錐をスライダーで組み立てよう',
    grades: ['high'],
    goalCount: 6,
    unit: '立体観察',
  },
  {
    id: 'g56-revolve',
    groupKind: 'g56',
    title: 'ぐるぐる回転体レーサー',
    badge: '5・6年',
    desc: '棒に平面図形を貼って高速スピン！回転の軌跡から浮かび上がる立体を当てよう',
    grades: ['high'],
    goalCount: 5,
    unit: '問クリア',
  },
  {
    id: 'g56-cutter',
    groupKind: 'g56',
    title: '立体カッター（切断面）',
    badge: '5・6年',
    desc: '立体を好きな角度でスライス！正方形・正三角形・五角形・正六角形の切り口を探そう',
    grades: ['high'],
    goalCount: 6,
    unit: '断面発見',
  },
  {
    id: 'sandbox',
    groupKind: 'sandbox',
    title: 'じゆうさくせいモード',
    badge: '全学年',
    desc: 'マス目に面をポチポチ並べてシールや色をぬり、オリジナル展開図を組み立てよう',
    grades: ['all', 'low', 'mid', 'high'],
    goalCount: 1,
    unit: '作品作成',
  },
];

export function isModeVisible(mode: ModeMeta, grade: GradeFilterId): boolean {
  return grade === 'all' || mode.grades.includes(grade) || mode.grades.includes('all');
}

export function findModeMeta(id: ModeId): ModeMeta {
  return MODES.find(m => m.id === id) ?? MODES[0];
}
