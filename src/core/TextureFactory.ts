import * as THREE from 'three';

export interface AnimalSticker {
  id: string;
  emoji: string;
  name: string;
  bg: string;
}

export const ANIMAL_STICKERS: AnimalSticker[] = [
  { id: 'dog', emoji: '🐶', name: 'いぬ', bg: '#fff5c2' },
  { id: 'cat', emoji: '🐱', name: 'ねこ', bg: '#fde3df' },
  { id: 'rabbit', emoji: '🐰', name: 'うさぎ', bg: '#ffe4ea' },
  { id: 'panda', emoji: '🐼', name: 'パンダ', bg: '#e3f4ec' },
  { id: 'lion', emoji: '🦁', name: 'ライオン', bg: '#ffe36e' },
  { id: 'frog', emoji: '🐸', name: 'かえる', bg: '#d7f3e3' },
  { id: 'chick', emoji: '🐥', name: 'ひよこ', bg: '#fff5c2' },
  { id: 'penguin', emoji: '🐧', name: 'ペンギン', bg: '#dceefb' },
];

export interface PaintStamp {
  id: string;
  symbol: string;
  name: string;
  color: string;
}

export const PAINT_STAMPS: PaintStamp[] = [
  { id: 'star', symbol: '★', name: 'ほし', color: '#d63c2c' },
  { id: 'flower', symbol: '✿', name: 'はな', color: '#e67e22' },
  { id: 'clover', symbol: '♣', name: 'クローバー', color: '#2e8b57' },
  { id: 'heart', symbol: '♥', name: 'ハート', color: '#d84374' },
  { id: 'diamond', symbol: '◆', name: 'ダイヤ', color: '#2b6cb0' },
  { id: 'note', symbol: '♪', name: 'おんぷ', color: '#6b46c1' },
];

const textureCache = new Map<string, THREE.CanvasTexture>();

export class TextureFactory {
  /** 方眼ノート風のベース面テクスチャ（文字・絵文字・スタンプ重ね描き対応） */
  public static createFaceTexture(options: {
    fill?: string;
    border?: string;
    label?: string;
    subLabel?: string;
    emoji?: string;
    diceValue?: number;
    stampSymbol?: string;
    stampColor?: string;
    highlight?: boolean;
  }): THREE.CanvasTexture {
    const key = JSON.stringify(options);
    const cached = textureCache.get(key);
    if (cached) return cached;

    if (typeof document === 'undefined') {
      const dummy = new THREE.CanvasTexture(null as unknown as HTMLCanvasElement);
      textureCache.set(key, dummy);
      return dummy;
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 背景紙色
    ctx.fillStyle = options.highlight ? '#ffe36e' : (options.fill ?? '#fdfdfa');
    ctx.fillRect(0, 0, size, size);

    // 方眼の細い罫線
    ctx.strokeStyle = 'rgba(106, 168, 147, 0.25)';
    ctx.lineWidth = 2;
    const step = size / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }

    // 外枠
    ctx.strokeStyle = options.border ?? '#1c2a4a';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, size - 10, size - 10);

    // サイコロの目
    if (options.diceValue && options.diceValue >= 1 && options.diceValue <= 6) {
      this.drawDiceDots(ctx, size, options.diceValue);
    }

    // スタンプ模様
    if (options.stampSymbol) {
      ctx.save();
      ctx.strokeStyle = options.stampColor ?? '#d63c2c';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = options.stampColor ?? '#d63c2c';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.stampSymbol, size / 2, size / 2 + 4);
      ctx.restore();
    }

    // 動物シール絵文字
    if (options.emoji) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2 - 8, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6aa893';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.font = '104px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.emoji, size / 2, size / 2 - 4);
      ctx.restore();
    }

    // 中央ラベルまたは下部ラベル
    if (options.label) {
      ctx.fillStyle = '#1c2a4a';
      ctx.font = options.emoji || options.stampSymbol
        ? 'bold 34px "Zen Maru Gothic", sans-serif'
        : 'bold 78px "Klee One", "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const yPos = options.emoji || options.stampSymbol ? size - 34 : size / 2;
      ctx.fillText(options.label, size / 2, yPos);
    }

    // 左上サブラベル
    if (options.subLabel) {
      ctx.fillStyle = '#566475';
      ctx.font = 'bold 28px "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(options.subLabel, 18, 16);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    textureCache.set(key, tex);
    return tex;
  }

  private static drawDiceDots(ctx: CanvasRenderingContext2D, size: number, val: number): void {
    const c = size / 2;
    const d = size * 0.25;
    const positions: Record<number, [number, number][]> = {
      1: [[c, c]],
      2: [[c - d, c - d], [c + d, c + d]],
      3: [[c - d, c - d], [c, c], [c + d, c + d]],
      4: [[c - d, c - d], [c + d, c - d], [c - d, c + d], [c + d, c + d]],
      5: [[c - d, c - d], [c + d, c - d], [c, c], [c - d, c + d], [c + d, c + d]],
      6: [
        [c - d, c - d], [c + d, c - d],
        [c - d, c], [c + d, c],
        [c - d, c + d], [c + d, c + d],
      ],
    };
    const pts = positions[val] || [];
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.fillStyle = val === 1 ? '#d63c2c' : '#1c2a4a';
      ctx.arc(x, y, val === 1 ? 30 : 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
