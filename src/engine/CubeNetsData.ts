// 立方体の展開図（全11種類）と失敗展開図データ、および3D折りたたみ・衝突・頂点/辺/面対応の幾何計算エンジン

export interface GridCoord {
  x: number;
  z: number;
}

export interface CubeNetPattern {
  id: string;
  index: number; // 1..11 (失敗パターンは 0)
  name: string;
  group: string; // '1-4-1型' | '2-3-1型' | '2-2-2型' | '3-3型' | '失敗パターン'
  cells: GridCoord[];
  rootIndex: number;
  isValid: boolean;
  hint: string;
}

/** 立方体の全11種類の正しい展開図 */
export const VALID_CUBE_NETS: CubeNetPattern[] = [
  // 1-4-1型 (6種類)
  {
    id: 'net-01',
    index: 1,
    name: '十字型（1-4-1①）',
    group: '1-4-1型',
    cells: [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 1, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '真ん中に4つ並び、上下に1つずつ向かい合ういちばん有名な形！',
  },
  {
    id: 'net-02',
    index: 2,
    name: 'ずらし十字A（1-4-1②）',
    group: '1-4-1型',
    cells: [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 2, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '真ん中の4つの帯の上下に1つずつ、少しずれてついている形。',
  },
  {
    id: 'net-03',
    index: 3,
    name: 'ずらし十字B（1-4-1③）',
    group: '1-4-1型',
    cells: [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '下の1つがはしっこに移動しても、ちゃんとフタになるよ。',
  },
  {
    id: 'net-04',
    index: 4,
    name: '両はし型（1-4-1④）',
    group: '1-4-1型',
    cells: [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 2 }],
    rootIndex: 1,
    isValid: true,
    hint: '左はしの同じ列の上下に1つずつあるT字のような形。',
  },
  {
    id: 'net-05',
    index: 5,
    name: '対角はし型（1-4-1⑤）',
    group: '1-4-1型',
    cells: [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '4つの帯の左上と右下に1つずつ飛び出たZ風のかたち。',
  },
  {
    id: 'net-06',
    index: 6,
    name: '内側対称型（1-4-1⑥）',
    group: '1-4-1型',
    cells: [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 2, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '左上のはしと、下側の内側に1つずつある形。',
  },
  // 2-3-1型 (3種類)
  {
    id: 'net-07',
    index: 7,
    name: '2-3-1 基本型①',
    group: '2-3-1型',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 1, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '上に2つ、真ん中に3つ、下に1つ並んだ形。2つの面が回転して横と奥をふさぐよ。',
  },
  {
    id: 'net-08',
    index: 8,
    name: '2-3-1 中央型②',
    group: '2-3-1型',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 2, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '下の1つが真ん中にずれた2-3-1型。',
  },
  {
    id: 'net-09',
    index: 9,
    name: '2-3-1 はし型③',
    group: '2-3-1型',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '階段のように遠くまで伸びる2-3-1型。',
  },
  // 2-2-2型 (1種類)
  {
    id: 'net-10',
    index: 10,
    name: 'かいだん型（2-2-2）',
    group: '2-2-2型',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 2 }],
    rootIndex: 2,
    isValid: true,
    hint: '2つずつ段差になったきれいな階段型！これも立方体になるよ。',
  },
  // 3-3型 (1種類)
  {
    id: 'net-11',
    index: 11,
    name: '3-3 スライド型',
    group: '3-3型',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 }],
    rootIndex: 2,
    isValid: true,
    hint: '3つ並びが2列、1マスだけ重なってつながった珍しい形！',
  },
];

/** 立方体にならない（重なる）ダミー展開図パターン */
export const INVALID_CUBE_NETS: CubeNetPattern[] = [
  {
    id: 'bad-01',
    index: 0,
    name: '片寄り十字（同じ側に2枚）',
    group: '失敗パターン',
    cells: [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }],
    rootIndex: 3,
    isValid: false,
    hint: '4つ並びの同じ側（上側）に2つあると、折りたたんだときに上のフタで2枚がぶつかって、下が空いてしまうよ！',
  },
  {
    id: 'bad-02',
    index: 0,
    name: 'コの字型（U字型）',
    group: '失敗パターン',
    cells: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }],
    rootIndex: 3,
    isValid: false,
    hint: '両はしが同じ方向に曲がっているので、組み立てると上でガチン！と重なってしまうよ。',
  },
  {
    id: 'bad-03',
    index: 0,
    name: '5連おび型',
    group: '失敗パターン',
    cells: [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 }, { x: 2, z: 0 }],
    rootIndex: 2,
    isValid: false,
    hint: '横に5つならぶと、ぐるっと1周して最初の面と5枚目の面が重なってしまうよ！',
  },
  {
    id: 'bad-04',
    index: 0,
    name: '田の字まじり型',
    group: '失敗パターン',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }],
    rootIndex: 3,
    isValid: false,
    hint: '2×2の「田の字」が入っていると、隣り合う面どうしが同じ場所に折れ曲がってぶつかるよ！',
  },
  {
    id: 'bad-05',
    index: 0,
    name: '3-3 2マス重なり型',
    group: '失敗パターン',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }],
    rootIndex: 2,
    isValid: false,
    hint: '3つ並びが2マス重なっている（田の字がある）ので、面が重なって穴があくよ。',
  },
  {
    id: 'bad-06',
    index: 0,
    name: 'カギ型（L字折れ）',
    group: '失敗パターン',
    cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 1, z: 2 }],
    rootIndex: 2,
    isValid: false,
    hint: 'ぐるっと回って同じ面の場所に戻ってきてしまう形だよ。',
  },
];

/** 2D座標配列を原点基準にソート正規化した文字列キーを返す */
function cellsToKey(cells: GridCoord[]): string {
  if (cells.length === 0) return '';
  let minX = Infinity;
  let minZ = Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.z < minZ) minZ = c.z;
  }
  const shifted = cells
    .map(c => ({ x: c.x - minX, z: c.z - minZ }))
    .sort((a, b) => (a.z !== b.z ? a.z - b.z : a.x - b.x));
  return shifted.map(c => `${c.x},${c.z}`).join(';');
}

/** 回転・反転の8変換すべてのうち辞書順最小の正規化キーを返す */
export function normalizeGridCells(cells: GridCoord[]): string {
  if (cells.length === 0) return '';
  const transforms: ((c: GridCoord) => GridCoord)[] = [
    c => ({ x: c.x, z: c.z }),
    c => ({ x: -c.z, z: c.x }),
    c => ({ x: -c.x, z: -c.z }),
    c => ({ x: c.z, z: -c.x }),
    c => ({ x: -c.x, z: c.z }),
    c => ({ x: c.x, z: -c.z }),
    c => ({ x: c.z, z: c.x }),
    c => ({ x: -c.z, z: -c.x }),
  ];
  const keys = transforms.map(fn => cellsToKey(cells.map(fn)));
  keys.sort();
  return keys[0];
}

/** 任意のセル集合が11種類のどの展開図に一致するか返す（一致しなければ null） */
export function matchCubeNetPattern(cells: GridCoord[]): CubeNetPattern | null {
  if (cells.length !== 6) return null;
  const targetKey = normalizeGridCells(cells);
  for (const pat of VALID_CUBE_NETS) {
    if (normalizeGridCells(pat.cells) === targetKey) {
      return pat;
    }
  }
  return null;
}

// ---- 3D 折りたたみ純粋数学シミュレーション ----

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FoldedFaceInfo {
  index: number;
  grid: GridCoord;
  center: Vec3;
  normal: Vec3;
  corners: [Vec3, Vec3, Vec3, Vec3]; // 左上, 右上, 右下, 左下 (ローカル順)
  faceSlot: 'BOTTOM' | 'TOP' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';
}

export interface FoldingAnalysis {
  isConnected: boolean;
  isValidCube: boolean;
  faces: FoldedFaceInfo[];
  collidingFacePairs: [number, number][];
  collidingFaceIndices: number[];
  missingSlots: ('BOTTOM' | 'TOP' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT')[];
  oppositePairs: [number, number][]; // 向かい合う面のインデックス組
  vertexGroups: { pos: Vec3; members: { faceIndex: number; cornerIndex: number; flatPos: Vec3 }[] }[];
  edgeGroups: { midpoint: Vec3; members: { faceIndex: number; edgeIndex: number; flatMid: Vec3 }[] }[];
}

function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function vec3Key(v: Vec3): string {
  return `${Math.round(v.x * 10)},${Math.round(v.y * 10)},${Math.round(v.z * 10)}`;
}

/** 点 p を pivot を通る単位軸 axis の周りに angle ラジアン回転 */
function rotatePointAroundAxis(p: Vec3, pivot: Vec3, axis: Vec3, angle: number): Vec3 {
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  const dz = p.z - pivot.z;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = dx * axis.x + dy * axis.y + dz * axis.z;
  const cx = axis.y * dz - axis.z * dy;
  const cy = axis.z * dx - axis.x * dz;
  const cz = axis.x * dy - axis.y * dx;
  return {
    x: pivot.x + dx * cos + cx * sin + axis.x * dot * (1 - cos),
    y: pivot.y + dy * cos + cy * sin + axis.y * dot * (1 - cos),
    z: pivot.z + dz * cos + cz * sin + axis.z * dot * (1 - cos),
  };
}

function rotateVectorAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  return rotatePointAroundAxis(v, { x: 0, y: 0, z: 0 }, axis, angle);
}

function classifySlot(normal: Vec3): 'BOTTOM' | 'TOP' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' {
  const nx = Math.round(normal.x);
  const ny = Math.round(normal.y);
  const nz = Math.round(normal.z);
  if (ny >= 1) return 'BOTTOM'; // 基準面の法線は上向き (+Y)
  if (ny <= -1) return 'TOP';
  if (nz <= -1) return 'FRONT';
  if (nz >= 1) return 'BACK';
  if (nx >= 1) return 'LEFT';
  return 'RIGHT';
}

/**
 * 2Dグリッド展開図を90度折りたたんだときの各面・頂点・辺の3D座標と衝突・対応関係を解析する
 */
export function analyzeNetFolding(cells: GridCoord[], rootIndex = 0): FoldingAnalysis {
  if (cells.length === 0) {
    return {
      isConnected: false,
      isValidCube: false,
      faces: [],
      collidingFacePairs: [],
      collidingFaceIndices: [],
      missingSlots: ['BOTTOM', 'TOP', 'FRONT', 'BACK', 'LEFT', 'RIGHT'],
      oppositePairs: [],
      vertexGroups: [],
      edgeGroups: [],
    };
  }

  const safeRoot = Math.min(Math.max(0, rootIndex), cells.length - 1);
  const rootGrid = cells[safeRoot];

  // BFS でヒンジの親子ツリーを作る
  const visited = new Set<number>([safeRoot]);
  const parentOf = new Map<number, { parent: number; dir: 'px' | 'nx' | 'pz' | 'nz' }>();
  const queue: number[] = [safeRoot];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const cg = cells[curr];
    for (let i = 0; i < cells.length; i++) {
      if (visited.has(i)) continue;
      const ng = cells[i];
      const dx = ng.x - cg.x;
      const dz = ng.z - cg.z;
      if (Math.abs(dx) + Math.abs(dz) === 1) {
        visited.add(i);
        const dir = dx === 1 ? 'px' : dx === -1 ? 'nx' : dz === 1 ? 'pz' : 'nz';
        parentOf.set(i, { parent: curr, dir });
        queue.push(i);
      }
    }
  }

  const isConnected = visited.size === cells.length;

  // 各セルの初期平面座標（root を (0,0,0) とする）
  const flatCenters: Vec3[] = cells.map(c => ({
    x: c.x - rootGrid.x,
    y: 0,
    z: c.z - rootGrid.z,
  }));

  const flatCorners: [Vec3, Vec3, Vec3, Vec3][] = flatCenters.map(fc => [
    { x: fc.x - 0.5, y: 0, z: fc.z - 0.5 }, // 0: 左奥 (-x, -z)
    { x: fc.x + 0.5, y: 0, z: fc.z - 0.5 }, // 1: 右奥 (+x, -z)
    { x: fc.x + 0.5, y: 0, z: fc.z + 0.5 }, // 2: 右手前 (+x, +z)
    { x: fc.x - 0.5, y: 0, z: fc.z + 0.5 }, // 3: 左手前 (-x, +z)
  ]);

  // 各セルのルートからのヒンジ列をたどって90度回転を適用（葉からルートへ逆順に局所ヒンジ回転）
  const faces: FoldedFaceInfo[] = cells.map((c, idx) => {
    // idx から safeRoot までのパスを取得
    const chain: { parent: number; child: number; dir: 'px' | 'nx' | 'pz' | 'nz' }[] = [];
    let cur = idx;
    while (parentOf.has(cur)) {
      const info = parentOf.get(cur)!;
      chain.push({ parent: info.parent, child: cur, dir: info.dir });
      cur = info.parent;
    }

    let center = { ...flatCenters[idx] };
    let normal: Vec3 = { x: 0, y: 1, z: 0 };
    let corners = flatCorners[idx].map(pt => ({ ...pt })) as [Vec3, Vec3, Vec3, Vec3];

    // 子側のヒンジから親側のヒンジへ順番に平面基準のヒンジ回転を適用
    for (const step of chain) {
      const pCenter = flatCenters[step.parent];
      let pivot: Vec3;
      let axis: Vec3;
      // 上方向 (+Y) に折り曲げるための右手系回転軸
      if (step.dir === 'px') {
        pivot = { x: pCenter.x + 0.5, y: 0, z: pCenter.z };
        axis = { x: 0, y: 0, z: 1 };
      } else if (step.dir === 'nx') {
        pivot = { x: pCenter.x - 0.5, y: 0, z: pCenter.z };
        axis = { x: 0, y: 0, z: -1 };
      } else if (step.dir === 'pz') {
        pivot = { x: pCenter.x, y: 0, z: pCenter.z + 0.5 };
        axis = { x: -1, y: 0, z: 0 };
      } else {
        pivot = { x: pCenter.x, y: 0, z: pCenter.z - 0.5 };
        axis = { x: 1, y: 0, z: 0 };
      }

      const angle = Math.PI / 2;
      center = rotatePointAroundAxis(center, pivot, axis, angle);
      normal = rotateVectorAroundAxis(normal, axis, angle);
      corners = corners.map(pt => rotatePointAroundAxis(pt, pivot, axis, angle)) as [Vec3, Vec3, Vec3, Vec3];
    }

    center = { x: roundCoord(center.x), y: roundCoord(center.y), z: roundCoord(center.z) };
    normal = { x: roundCoord(normal.x), y: roundCoord(normal.y), z: roundCoord(normal.z) };
    corners = corners.map(pt => ({
      x: roundCoord(pt.x),
      y: roundCoord(pt.y),
      z: roundCoord(pt.z),
    })) as [Vec3, Vec3, Vec3, Vec3];

    return {
      index: idx,
      grid: c,
      center,
      normal,
      corners,
      faceSlot: classifySlot(normal),
    };
  });

  // 面同士の衝突（同じ3D中心座標に重なる面）を検出
  const collidingFacePairs: [number, number][] = [];
  const collidingSet = new Set<number>();
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      if (!visited.has(i) || !visited.has(j)) continue;
      const dist = Math.hypot(
        faces[i].center.x - faces[j].center.x,
        faces[i].center.y - faces[j].center.y,
        faces[i].center.z - faces[j].center.z
      );
      if (dist < 0.15) {
        collidingFacePairs.push([i, j]);
        collidingSet.add(i);
        collidingSet.add(j);
      }
    }
  }

  // 6方向の面が揃っているか確認
  const allSlots: ('BOTTOM' | 'TOP' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT')[] = [
    'BOTTOM', 'TOP', 'FRONT', 'BACK', 'LEFT', 'RIGHT',
  ];
  const coveredSlots = new Set(faces.filter((_, idx) => visited.has(idx)).map(f => f.faceSlot));
  const missingSlots = allSlots.filter(s => !coveredSlots.has(s));

  const isValidCube =
    isConnected &&
    cells.length === 6 &&
    collidingFacePairs.length === 0 &&
    missingSlots.length === 0;

  // 向かい合う面ペア（法線が正反対で衝突していない組）
  const oppositePairs: [number, number][] = [];
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const ni = faces[i].normal;
      const nj = faces[j].normal;
      if (
        Math.round(ni.x + nj.x) === 0 &&
        Math.round(ni.y + nj.y) === 0 &&
        Math.round(ni.z + nj.z) === 0 &&
        !collidingSet.has(i) &&
        !collidingSet.has(j)
      ) {
        oppositePairs.push([i, j]);
      }
    }
  }

  // 頂点グループ（100%閉じたとき同じ3D頂点座標に集まる頂点たち）
  const vMap = new Map<string, { pos: Vec3; members: { faceIndex: number; cornerIndex: number; flatPos: Vec3 }[] }>();
  faces.forEach((f, fIdx) => {
    f.corners.forEach((cPos, cIdx) => {
      const key = vec3Key(cPos);
      if (!vMap.has(key)) {
        vMap.set(key, { pos: cPos, members: [] });
      }
      vMap.get(key)!.members.push({
        faceIndex: fIdx,
        cornerIndex: cIdx,
        flatPos: flatCorners[fIdx][cIdx],
      });
    });
  });

  // 辺グループ（100%閉じたとき同じ3D辺中点に重なる辺たち）
  const eMap = new Map<string, { midpoint: Vec3; members: { faceIndex: number; edgeIndex: number; flatMid: Vec3 }[] }>();
  faces.forEach((f, fIdx) => {
    for (let eIdx = 0; eIdx < 4; eIdx++) {
      const c1 = f.corners[eIdx];
      const c2 = f.corners[(eIdx + 1) % 4];
      const mid: Vec3 = {
        x: roundCoord((c1.x + c2.x) / 2),
        y: roundCoord((c1.y + c2.y) / 2),
        z: roundCoord((c1.z + c2.z) / 2),
      };
      const fc1 = flatCorners[fIdx][eIdx];
      const fc2 = flatCorners[fIdx][(eIdx + 1) % 4];
      const flatMid: Vec3 = {
        x: roundCoord((fc1.x + fc2.x) / 2),
        y: 0,
        z: roundCoord((fc1.z + fc2.z) / 2),
      };
      const key = vec3Key(mid);
      if (!eMap.has(key)) {
        eMap.set(key, { midpoint: mid, members: [] });
      }
      eMap.get(key)!.members.push({
        faceIndex: fIdx,
        edgeIndex: eIdx,
        flatMid,
      });
    }
  });

  return {
    isConnected,
    isValidCube,
    faces,
    collidingFacePairs,
    collidingFaceIndices: Array.from(collidingSet),
    missingSlots,
    oppositePairs,
    vertexGroups: Array.from(vMap.values()),
    edgeGroups: Array.from(eMap.values()),
  };
}
