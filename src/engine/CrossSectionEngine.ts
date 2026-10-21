// 立体カッター（平面による立体の切断面計算＆断面図形名判定エンジン）

import { Vec3 } from './CubeNetsData';

export interface CrossSectionResult {
  points3D: Vec3[];
  points2D: { x: number; y: number }[]; // 切断平面上の2D正射影座標
  vertexCount: number;
  shapeName: string;
  description: string;
}

const CUBE_VERTICES: Vec3[] = [
  { x: -1, y: -1, z: -1 }, // 0
  { x: 1, y: -1, z: -1 },  // 1
  { x: 1, y: 1, z: -1 },   // 2
  { x: -1, y: 1, z: -1 },  // 3
  { x: -1, y: -1, z: 1 },  // 4
  { x: 1, y: -1, z: 1 },   // 5
  { x: 1, y: 1, z: 1 },    // 6
  { x: -1, y: 1, z: 1 },   // 7
];

const CUBE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // 奥面
  [4, 5], [5, 6], [6, 7], [7, 4], // 手前面
  [0, 4], [1, 5], [2, 6], [3, 7], // 接続辺
];

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVec(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * 立方体 [-1, 1]^3 と平面 (dot(normal, P) = offset) の交差ポリゴンを算出する
 */
export function computeCubeCrossSection(rawNormal: Vec3, offset: number): CrossSectionResult {
  const n = normalizeVec(rawNormal);
  const rawPts: Vec3[] = [];

  for (const [i, j] of CUBE_EDGES) {
    const p1 = CUBE_VERTICES[i];
    const p2 = CUBE_VERTICES[j];
    const d1 = dotVec(n, p1) - offset;
    const d2 = dotVec(n, p2) - offset;

    if (Math.abs(d1) < 1e-5 && Math.abs(d2) < 1e-5) {
      rawPts.push({ ...p1 }, { ...p2 });
    } else if (d1 * d2 <= 0) {
      const denom = d1 - d2;
      const t = Math.abs(denom) < 1e-7 ? 0 : d1 / denom;
      if (t >= -1e-5 && t <= 1 + 1e-5) {
        const tc = Math.min(1, Math.max(0, t));
        rawPts.push({
          x: p1.x + (p2.x - p1.x) * tc,
          y: p1.y + (p2.y - p1.y) * tc,
          z: p1.z + (p2.z - p1.z) * tc,
        });
      }
    }
  }

  // 重複頂点を除去
  const uniquePts: Vec3[] = [];
  for (const p of rawPts) {
    if (!uniquePts.some(u => dist3D(u, p) < 1e-3)) {
      uniquePts.push(p);
    }
  }

  if (uniquePts.length < 3) {
    return {
      points3D: [],
      points2D: [],
      vertexCount: 0,
      shapeName: '切り口なし',
      description: 'カッターの平面が立体に当たっていません。高さを調整してみよう！',
    };
  }

  // 重心を求める
  const center: Vec3 = { x: 0, y: 0, z: 0 };
  for (const p of uniquePts) {
    center.x += p.x / uniquePts.length;
    center.y += p.y / uniquePts.length;
    center.z += p.z / uniquePts.length;
  }

  // 平面上の基底ベクトル u, v を構築
  const ref: Vec3 = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const uAxis = normalizeVec(crossVec(ref, n));
  const vAxis = normalizeVec(crossVec(n, uAxis));

  // 角度順にソート
  const withAngles = uniquePts.map(p => {
    const rel: Vec3 = { x: p.x - center.x, y: p.y - center.y, z: p.z - center.z };
    const x2 = dotVec(rel, uAxis);
    const y2 = dotVec(rel, vAxis);
    const angle = Math.atan2(y2, x2);
    return { p, x2, y2, angle };
  });
  withAngles.sort((a, b) => a.angle - b.angle);

  const sorted3D = withAngles.map(w => w.p);
  const sorted2D = withAngles.map(w => ({ x: w.x2, y: w.y2 }));

  const { shapeName, description } = classifyPolygonShape(sorted2D);

  return {
    points3D: sorted3D,
    points2D: sorted2D,
    vertexCount: sorted3D.length,
    shapeName,
    description,
  };
}

function classifyPolygonShape(pts: { x: number; y: number }[]): { shapeName: string; description: string } {
  const k = pts.length;
  const sideLengths: number[] = [];
  for (let i = 0; i < k; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % k];
    sideLengths.push(Math.hypot(p2.x - p1.x, p2.y - p1.y));
  }

  const maxSide = Math.max(...sideLengths);
  const minSide = Math.min(...sideLengths);
  const allSidesEqual = maxSide - minSide < 0.06;

  if (k === 3) {
    if (allSidesEqual) {
      return {
        shapeName: '正三角形',
        description: '3つの辺の長さがすべて同じ「正三角形」の切り口になったよ！頂点を3つ通る角度で切ると現れます。',
      };
    }
    const [a, b, c] = sideLengths;
    if (Math.abs(a - b) < 0.06 || Math.abs(b - c) < 0.06 || Math.abs(c - a) < 0.06) {
      return {
        shapeName: '二等辺三角形',
        description: '2つの辺の長さが等しい「二等辺三角形」の切り口になったよ！カドを斜めに切り落とすと現れます。',
      };
    }
    return {
      shapeName: '三角形',
      description: '立方体のカド（頂点付近）を3つの面を通るように切ると「三角形」の断面になるよ。',
    };
  }

  if (k === 4) {
    // 対辺と直角度をチェック
    const v0 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
    const v1 = { x: pts[2].x - pts[1].x, y: pts[2].y - pts[1].y };
    const dot01 = Math.abs(v0.x * v1.x + v0.y * v1.y) / ((sideLengths[0] * sideLengths[1]) || 1);
    const isRightAngle = dot01 < 0.08;

    if (allSidesEqual && isRightAngle) {
      return {
        shapeName: '正方形',
        description: '面に平行にまっすぐ切ると、4つの辺と角がすべて等しい「正方形」の切り口になるよ！',
      };
    }
    if (isRightAngle && Math.abs(sideLengths[0] - sideLengths[2]) < 0.06) {
      return {
        shapeName: '長方形',
        description: '立方体をななめや対角線方向にまっすぐ切ると、縦と横の長さがちがう「長方形」になるよ！',
      };
    }
    if (allSidesEqual) {
      return {
        shapeName: 'ひし形',
        description: '4つの辺の長さがすべて同じ「ひし形」の断面になったよ！',
      };
    }
    return {
      shapeName: '台形・四角形',
      description: '4つの面を通るように斜めに切ると、台形や四角形の切り口になるよ！',
    };
  }

  if (k === 5) {
    return {
      shapeName: '五角形',
      description: '立方体の6つの面のうち、5つの面を同時に通る角度で切ると「五角形」が現れるよ！',
    };
  }

  if (k === 6) {
    if (allSidesEqual) {
      return {
        shapeName: '正六角形',
        description: '大発見！6つの辺の中点を通るように中心を斜めに切ると、美しい「正六角形」が現れるよ！',
      };
    }
    return {
      shapeName: '六角形',
      description: '立方体の6つの面すべてを通るように切ると「六角形」の切り口になるよ！',
    };
  }

  return {
    shapeName: `${k}角形`,
    description: `${k}つの辺をもつ多角形の断面です。`,
  };
}
