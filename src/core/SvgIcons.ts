// math-quiz と同じ赤ペンの花丸とリスザルキャラクターを描画するヘルパー

const LINE = '#1c2a4a';
const RED = '#e8546a';
const YELLOW = '#ffd23f';
const MUZZLE = '#3d3a44';
const DEFAULT_LOOK = { fur: '#e3b84f', light: '#fffaf0', cap: '#6b6558', pink: '#f3b8a4' };

/** 花丸の線 (うずまきのあとに花びら) */
export function hanamaruPoints(): string {
  const pts: string[] = [];
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    const a = t * 3 * Math.PI * 2 - Math.PI / 2;
    const r = 3 + t * 24;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  for (let i = 1; i <= 120; i++) {
    const t = i / 120;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const r = 27 + 13 * Math.abs(Math.sin(t * Math.PI * 6));
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const CACHED_HANAMARU_PTS = hanamaruPoints();

export function renderHanamaruSvg(className = 'hanamaru', animated = false): string {
  const cls = `${className}${animated ? ' is-drawn' : ''}`;
  return `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true"><polyline points="${CACHED_HANAMARU_PTS}" pathLength="1" /></svg>`;
}

/** ホーム画面のリスザル（えんぴつ付き） */
export function renderMonkeySvg(): string {
  const c = DEFAULT_LOOK;
  const openEye = (x: number) =>
    `<ellipse cx="${x}" cy="69" rx="7.5" ry="8.5" fill="${LINE}"/>` +
    `<circle cx="${x + 2.6}" cy="65.4" r="3.1" fill="#fff"/>` +
    `<circle cx="${x - 2.6}" cy="72.6" r="1.5" fill="#fff"/>`;
  const noseAndSmile =
    `<path fill="#77717f" d="M56.6 85.2Q60 83.6 63.4 85.2Q62 88.2 60 88.6Q58 88.2 56.6 85.2Z"/>` +
    `<path fill="none" stroke="#f6dccd" stroke-width="2" stroke-linecap="round" d="M53.5 92Q60 97.5 66.5 92"/>`;
  const pencil =
    `<g transform="rotate(30 97 34)" stroke="${LINE}" stroke-width="2" stroke-linejoin="round">` +
    `<rect x="93" y="12" width="8" height="6" fill="#f7a3b0"/><rect x="93" y="18" width="8" height="26" fill="${YELLOW}"/>` +
    `<path fill="#f6e0b5" d="M93 44H101L97 54Z"/><path fill="${LINE}" stroke="none" d="M95.4 50H98.6L97 54Z"/></g>`;

  const face =
    `<g stroke="${LINE}" stroke-width="2.5">` +
    `<circle cx="16" cy="61" r="13.5" fill="${c.light}"/><circle cx="104" cy="61" r="13.5" fill="${c.light}"/></g>` +
    `<circle cx="17.5" cy="62" r="6.5" fill="${c.pink}"/><circle cx="102.5" cy="62" r="6.5" fill="${c.pink}"/>` +
    `<path fill="${c.fur}" stroke="${LINE}" stroke-width="2.5" stroke-linejoin="round" d="M60 26C35 26 20 44 20 66C20 90 38 106 60 106C82 106 100 90 100 66C100 44 85 26 60 26Z"/>` +
    `<path fill="${c.cap}" d="M22.6 53C25 37 40 27.4 60 27.4C80 27.4 95 37 97.4 53C90 44 80 42 72 46C67 48.5 63 53 60 59C57 53 53 48.5 48 46C40 42 30 44 22.6 53Z"/>` +
    `<path fill="${c.light}" d="M60 58C54 48 40 46 31.5 54C24.5 61 24.5 76 31.5 84C38 91 50 92 60 87C70 92 82 91 88.5 84C95.5 76 95.5 61 88.5 54C80 46 66 48 60 58Z"/>` +
    `<ellipse cx="33.5" cy="81" rx="5.5" ry="3.4" fill="${c.pink}" opacity="0.7"/>` +
    `<ellipse cx="86.5" cy="81" rx="5.5" ry="3.4" fill="${c.pink}" opacity="0.7"/>` +
    `<ellipse cx="60" cy="90.5" rx="14" ry="10.5" fill="${MUZZLE}" stroke="${LINE}" stroke-width="2"/>` +
    openEye(43) +
    openEye(77) +
    noseAndSmile +
    pencil;

  return `<div class="monkey"><svg viewBox="0 0 120 110" role="img" aria-label="リスザルのキャラクター">${face}</svg></div>`;
}
