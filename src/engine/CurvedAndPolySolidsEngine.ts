import * as THREE from 'three';

export type SolidCraftType =
  | 'cylinder'
  | 'cone'
  | 'tri-prism'
  | 'hex-prism'
  | 'sq-pyramid'
  | 'tetrahedron';

export interface SolidCraftMeta {
  id: SolidCraftType;
  name: string;
  badge: string;
  facesSummary: string;
  description: string;
}

export const SOLID_CRAFT_LIST: SolidCraftMeta[] = [
  {
    id: 'cylinder',
    name: '円柱（えんちゅう）',
    badge: '5年・曲面',
    facesSummary: '底面：円 2つ ／ 側面：長方形 1つ',
    description: '平らな「長方形」の側面がくるっと丸まって筒になり、上下の2つの「円」がパタンと閉じて円柱になります。側面の横の長さは「底面の円周（直径×3.14）」と同じ！',
  },
  {
    id: 'cone',
    name: '円錐（えんすい）',
    badge: '6年・曲面',
    facesSummary: '底面：円 1つ ／ 側面：おうぎ形 1つ',
    description: '側面を開くと「おうぎ形」になり、底面は1つの「円」になります。おうぎ形の孤（こ）の長さと、底面の円周の長さがぴったり重なるよ！',
  },
  {
    id: 'tri-prism',
    name: '三角柱（さんかくちゅう）',
    badge: '5年・角柱',
    facesSummary: '底面：三角形 2つ ／ 側面：長方形 3つ',
    description: '3つの長方形が120°ずつ折れ曲がって三角の筒をつくり、上下の正三角形のフタが90°折れて閉じます。',
  },
  {
    id: 'hex-prism',
    name: '六角柱（ろっかくちゅう）',
    badge: '5年・角柱',
    facesSummary: '底面：六角形 2つ ／ 側面：長方形 6つ',
    description: '6枚の長方形が60°ずつ折れ曲がって六角形の筒になり、上下の正六角形の底面がピタッと閉じます。',
  },
  {
    id: 'sq-pyramid',
    name: '正四角錐（せいしかくすい）',
    badge: '6年・角錐',
    facesSummary: '底面：正方形 1つ ／ 側面：二等辺三角形 4つ',
    description: '真ん中の正方形のまわりにある4つの三角形が立ち上がり、てっぺんの1つの頂点に集まってピラミッドの形になります。',
  },
  {
    id: 'tetrahedron',
    name: '正三角錐（正四面体）',
    badge: '6年・角錐',
    facesSummary: '面：正三角形 4つ（大きな正三角形の展開図）',
    description: '4枚の正三角形でできたピラミッド。展開図は大きな正三角形になり、3つの角を折り曲げると頂点でピタッと出会います。',
  },
];

export class CurvedAndPolySolidsEngine {
  public rootObject = new THREE.Group();
  private currentType: SolidCraftType = 'cylinder';
  private updateFn: ((t: number) => void) | null = null;

  constructor(type: SolidCraftType = 'cylinder') {
    this.buildSolid(type);
  }

  public buildSolid(type: SolidCraftType): void {
    this.currentType = type;
    this.rootObject.clear();
    this.updateFn = null;

    switch (type) {
      case 'cylinder':
        this.buildCylinder();
        break;
      case 'cone':
        this.buildCone();
        break;
      case 'tri-prism':
        this.buildTriangularPrism();
        break;
      case 'hex-prism':
        this.buildHexagonalPrism();
        break;
      case 'sq-pyramid':
        this.buildSquarePyramid();
        break;
      case 'tetrahedron':
        this.buildTetrahedron();
        break;
    }
    this.setFoldProgress(0);
  }

  public setFoldProgress(percent: number): void {
    const t = Math.min(1, Math.max(0, percent / 100));
    if (this.updateFn) {
      this.updateFn(t);
    }
  }

  private createPaperMaterial(colorHex: number, doubleSide = true): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({
      color: colorHex,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  private addEdgeOutline(mesh: THREE.Mesh, geom: THREE.BufferGeometry, color = 0x1c2a4a): void {
    const edges = new THREE.EdgesGeometry(geom, 15);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
    mesh.add(line);
  }

  /** 1. 円柱：長方形の側面が細分割ヒンジでくるっと丸まり、上下の円が90°折れる */
  private buildCylinder(): void {
    const R = 0.85;
    const H = 1.8;
    const N = 36; // 分割ストリップ数（左右18枚ずつ）
    const dTheta = (Math.PI * 2) / N;
    const stripW = 2 * R * Math.sin(dTheta / 2);

    const baseGroup = new THREE.Group();
    this.rootObject.add(baseGroup);

    const sideMat = this.createPaperMaterial(0xfff5c2);
    const capMat = this.createPaperMaterial(0xc5ddd3);

    // 中央基準ストリップ（床のz方向に高さH、x方向に幅stripW）
    const centerGeom = new THREE.PlaneGeometry(stripW, H);
    centerGeom.rotateX(-Math.PI / 2);
    const centerMesh = new THREE.Mesh(centerGeom, sideMat);
    baseGroup.add(centerMesh);

    // 右側チェーン (N/2 枚)
    const rightPivots: THREE.Group[] = [];
    let parentRight: THREE.Object3D = baseGroup;
    for (let i = 0; i < N / 2; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(i === 0 ? stripW / 2 : stripW, 0, 0);
      parentRight.add(pivot);

      const g = new THREE.PlaneGeometry(stripW, H);
      g.rotateX(-Math.PI / 2);
      g.translate(stripW / 2, 0, 0);
      const m = new THREE.Mesh(g, sideMat);
      pivot.add(m);

      // 上下の輪郭線
      const edgeLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.005, -H / 2),
        new THREE.Vector3(stripW, 0.005, -H / 2),
        new THREE.Vector3(0, 0.005, H / 2),
        new THREE.Vector3(stripW, 0.005, H / 2),
      ]);
      const seg = new THREE.LineSegments(edgeLineGeom, new THREE.LineBasicMaterial({ color: 0x1c2a4a }));
      pivot.add(seg);

      rightPivots.push(pivot);
      parentRight = pivot;
    }

    // 左側チェーン (N/2 - 1 枚)
    const leftPivots: THREE.Group[] = [];
    let parentLeft: THREE.Object3D = baseGroup;
    for (let i = 0; i < N / 2 - 1; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(i === 0 ? -stripW / 2 : -stripW, 0, 0);
      parentLeft.add(pivot);

      const g = new THREE.PlaneGeometry(stripW, H);
      g.rotateX(-Math.PI / 2);
      g.translate(-stripW / 2, 0, 0);
      const m = new THREE.Mesh(g, sideMat);
      pivot.add(m);

      const edgeLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.005, -H / 2),
        new THREE.Vector3(-stripW, 0.005, -H / 2),
        new THREE.Vector3(0, 0.005, H / 2),
        new THREE.Vector3(-stripW, 0.005, H / 2),
      ]);
      const seg = new THREE.LineSegments(edgeLineGeom, new THREE.LineBasicMaterial({ color: 0x1c2a4a }));
      pivot.add(seg);

      leftPivots.push(pivot);
      parentLeft = pivot;
    }

    // 奥側（上底面）の円ヒンジ (z = -H/2 に接する)
    const topCapPivot = new THREE.Group();
    topCapPivot.position.set(0, 0, -H / 2);
    baseGroup.add(topCapPivot);

    const topCircleGeom = new THREE.CircleGeometry(R, 40);
    topCircleGeom.rotateX(-Math.PI / 2);
    topCircleGeom.translate(0, 0, -R);
    const topCircleMesh = new THREE.Mesh(topCircleGeom, capMat);
    this.addEdgeOutline(topCircleMesh, topCircleGeom);
    topCapPivot.add(topCircleMesh);

    // 手前側（下底面）の円ヒンジ (z = +H/2 に接する)
    const botCapPivot = new THREE.Group();
    botCapPivot.position.set(0, 0, H / 2);
    baseGroup.add(botCapPivot);

    const botCircleGeom = new THREE.CircleGeometry(R, 40);
    botCircleGeom.rotateX(-Math.PI / 2);
    botCircleGeom.translate(0, 0, R);
    const botCircleMesh = new THREE.Mesh(botCircleGeom, capMat);
    this.addEdgeOutline(botCircleMesh, botCircleGeom);
    botCapPivot.add(botCircleMesh);

    this.updateFn = (t: number) => {
      const stepAngle = dTheta * t;
      for (const p of rightPivots) {
        p.rotation.z = stepAngle;
      }
      for (const p of leftPivots) {
        p.rotation.z = -stepAngle;
      }
      topCapPivot.rotation.x = (Math.PI / 2) * t;
      botCapPivot.rotation.x = -(Math.PI / 2) * t;
    };
  }

  /** 2. 円錐：おうぎ形の側面が丸まって円錐になり、底面の円が閉じる */
  private buildCone(): void {
    const R = 0.9; // 底面の半径
    const H = 1.65; // 円錐の高さ
    const L = Math.hypot(R, H); // 母線の長さ
    const sectorAngle = (2 * Math.PI * R) / L; // 展開図のおうぎ形の中心角
    const N = 28; // 扇形を分割するくさびの数

    const root = new THREE.Group();
    root.position.set(0, 0, -0.3);
    this.rootObject.add(root);

    const sideMat = this.createPaperMaterial(0xffe36e);
    const capMat = this.createPaperMaterial(0xc5ddd3);

    // 頂点を原点 (0,0,0) とし、各くさび三角形を放射ヒンジで連結して丸める
    const dPhi = sectorAngle / N;
    const halfBase = L * Math.sin(dPhi / 2);
    const wedgeH = L * Math.cos(dPhi / 2);

    // 2つのくさびが母線で折れ曲がる二面角を計算
    const coneHalfApex = Math.asin(R / L);
    // 100%時に円錐を作るための各母線ヒンジ角
    const maxDihedralFold = (2 * Math.PI / N) * Math.cos(coneHalfApex);

    const makeWedgeGeom = (dir: 1 | -1 | 0): THREE.BufferGeometry => {
      const geom = new THREE.BufferGeometry();
      // 頂点 O(0,0,0), A(-halfBase, 0, wedgeH), B(+halfBase, 0, wedgeH)
      let x0 = -halfBase;
      let x1 = halfBase;
      if (dir === 1) {
        x0 = 0;
        x1 = 2 * halfBase;
      } else if (dir === -1) {
        x0 = -2 * halfBase;
        x1 = 0;
      }
      const vertices = new Float32Array([
        0, 0, 0,
        x0, 0, wedgeH,
        x1, 0, wedgeH,
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geom.computeVertexNormals();
      return geom;
    };

    // 中央くさび
    const centerGeom = makeWedgeGeom(0);
    const centerMesh = new THREE.Mesh(centerGeom, sideMat);
    root.add(centerMesh);

    // 右側くさびチェーン
    const rightHinges: { pivot: THREE.Object3D; axis: THREE.Vector3 }[] = [];
    let currRight: THREE.Object3D = root;
    for (let i = 0; i < N / 2; i++) {
      const hinge = new THREE.Group();
      // 親くさびの右母線の方向ベクトルに沿って回転させる
      const edgeAngle = i === 0 ? dPhi / 2 : dPhi;
      currRight.add(hinge);
      hinge.rotation.y = edgeAngle;

      const wg = new THREE.BufferGeometry();
      const wVerts = new Float32Array([
        0, 0, 0,
        0, 0, L,
        L * Math.sin(dPhi), 0, L * Math.cos(dPhi),
      ]);
      wg.setAttribute('position', new THREE.BufferAttribute(wVerts, 3));
      wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, sideMat);
      hinge.add(wm);

      // 外周の弧の線
      const rim = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.005, L),
        new THREE.Vector3(L * Math.sin(dPhi), 0.005, L * Math.cos(dPhi)),
      ]);
      hinge.add(new THREE.Line(rim, new THREE.LineBasicMaterial({ color: 0x1c2a4a })));

      rightHinges.push({ pivot: wm, axis: new THREE.Vector3(0, 0, 1) });
      // 次のヒンジは dPhi 回転した母線上
      const nextContainer = new THREE.Group();
      wm.add(nextContainer);
      currRight = nextContainer;
    }

    // 左側くさびチェーン
    const leftHinges: { pivot: THREE.Object3D }[] = [];
    let currLeft: THREE.Object3D = root;
    for (let i = 0; i < N / 2 - 1; i++) {
      const hinge = new THREE.Group();
      const edgeAngle = i === 0 ? -dPhi / 2 : -dPhi;
      currLeft.add(hinge);
      hinge.rotation.y = edgeAngle;

      const wg = new THREE.BufferGeometry();
      const wVerts = new Float32Array([
        0, 0, 0,
        -L * Math.sin(dPhi), 0, L * Math.cos(dPhi),
        0, 0, L,
      ]);
      wg.setAttribute('position', new THREE.BufferAttribute(wVerts, 3));
      wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, sideMat);
      hinge.add(wm);

      const rim = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.005, L),
        new THREE.Vector3(-L * Math.sin(dPhi), 0.005, L * Math.cos(dPhi)),
      ]);
      hinge.add(new THREE.Line(rim, new THREE.LineBasicMaterial({ color: 0x1c2a4a })));

      leftHinges.push({ pivot: wm });
      const nextContainer = new THREE.Group();
      wm.add(nextContainer);
      currLeft = nextContainer;
    }

    // 底面の円（中央くさびの先端 z = wedgeH に接続）
    const baseCapHinge = new THREE.Group();
    baseCapHinge.position.set(0, 0, wedgeH);
    root.add(baseCapHinge);

    const capGeom = new THREE.CircleGeometry(R, 36);
    capGeom.rotateX(-Math.PI / 2);
    capGeom.translate(0, 0, R);
    const capMesh = new THREE.Mesh(capGeom, capMat);
    this.addEdgeOutline(capMesh, capGeom);
    baseCapHinge.add(capMesh);

    const capTargetFold = Math.PI - Math.acos(R / L);

    this.updateFn = (t: number) => {
      const fold = maxDihedralFold * t;
      for (const h of rightHinges) {
        h.pivot.rotation.z = fold;
      }
      for (const h of leftHinges) {
        h.pivot.rotation.z = -fold;
      }
      baseCapHinge.rotation.x = -capTargetFold * t;
    };
  }

  /** 3. 三角柱 */
  private buildTriangularPrism(): void {
    const W = 1.25;
    const H = 1.65;
    const triH = (Math.sqrt(3) / 2) * W;

    const sideMat = this.createPaperMaterial(0xfff5c2);
    const capMat = this.createPaperMaterial(0xc5ddd3);

    // 中央長方形
    const centerGeom = new THREE.PlaneGeometry(W, H);
    centerGeom.rotateX(-Math.PI / 2);
    const centerMesh = new THREE.Mesh(centerGeom, sideMat);
    this.addEdgeOutline(centerMesh, centerGeom);
    this.rootObject.add(centerMesh);

    // 右側面 (120度折れる)
    const rightHinge = new THREE.Group();
    rightHinge.position.set(W / 2, 0, 0);
    this.rootObject.add(rightHinge);
    const rightGeom = new THREE.PlaneGeometry(W, H);
    rightGeom.rotateX(-Math.PI / 2);
    rightGeom.translate(W / 2, 0, 0);
    const rightMesh = new THREE.Mesh(rightGeom, sideMat);
    this.addEdgeOutline(rightMesh, rightGeom);
    rightHinge.add(rightMesh);

    // 左側面 (120度折れる)
    const leftHinge = new THREE.Group();
    leftHinge.position.set(-W / 2, 0, 0);
    this.rootObject.add(leftHinge);
    const leftGeom = new THREE.PlaneGeometry(W, H);
    leftGeom.rotateX(-Math.PI / 2);
    leftGeom.translate(-W / 2, 0, 0);
    const leftMesh = new THREE.Mesh(leftGeom, sideMat);
    this.addEdgeOutline(leftMesh, leftGeom);
    leftHinge.add(leftMesh);

    // 奥の正三角形 (90度折れる)
    const topHinge = new THREE.Group();
    topHinge.position.set(0, 0, -H / 2);
    this.rootObject.add(topHinge);
    const topTriGeom = new THREE.BufferGeometry();
    topTriGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-W / 2, 0, 0, W / 2, 0, 0, 0, 0, -triH]),
        3
      )
    );
    topTriGeom.computeVertexNormals();
    const topTriMesh = new THREE.Mesh(topTriGeom, capMat);
    this.addEdgeOutline(topTriMesh, topTriGeom);
    topHinge.add(topTriMesh);

    // 手前の正三角形 (90度折れる)
    const botHinge = new THREE.Group();
    botHinge.position.set(0, 0, H / 2);
    this.rootObject.add(botHinge);
    const botTriGeom = new THREE.BufferGeometry();
    botTriGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-W / 2, 0, 0, 0, 0, triH, W / 2, 0, 0]),
        3
      )
    );
    botTriGeom.computeVertexNormals();
    const botTriMesh = new THREE.Mesh(botTriGeom, capMat);
    this.addEdgeOutline(botTriMesh, botTriGeom);
    botHinge.add(botTriMesh);

    this.updateFn = (t: number) => {
      rightHinge.rotation.z = ((2 * Math.PI) / 3) * t;
      leftHinge.rotation.z = -((2 * Math.PI) / 3) * t;
      topHinge.rotation.x = (Math.PI / 2) * t;
      botHinge.rotation.x = -(Math.PI / 2) * t;
    };
  }

  /** 4. 六角柱 */
  private buildHexagonalPrism(): void {
    const W = 0.72;
    const H = 1.5;
    const sideMat = this.createPaperMaterial(0xfff5c2);
    const capMat = this.createPaperMaterial(0xc5ddd3);

    // 中央側面
    const centerGeom = new THREE.PlaneGeometry(W, H);
    centerGeom.rotateX(-Math.PI / 2);
    const centerMesh = new THREE.Mesh(centerGeom, sideMat);
    this.addEdgeOutline(centerMesh, centerGeom);
    this.rootObject.add(centerMesh);

    // 右側に3枚連ねる
    const rightHinges: THREE.Group[] = [];
    let parentR: THREE.Object3D = this.rootObject;
    for (let i = 0; i < 3; i++) {
      const h = new THREE.Group();
      h.position.set(i === 0 ? W / 2 : W, 0, 0);
      parentR.add(h);
      const g = new THREE.PlaneGeometry(W, H);
      g.rotateX(-Math.PI / 2);
      g.translate(W / 2, 0, 0);
      const m = new THREE.Mesh(g, sideMat);
      this.addEdgeOutline(m, g);
      h.add(m);
      rightHinges.push(h);
      parentR = h;
    }

    // 左側に2枚連ねる
    const leftHinges: THREE.Group[] = [];
    let parentL: THREE.Object3D = this.rootObject;
    for (let i = 0; i < 2; i++) {
      const h = new THREE.Group();
      h.position.set(i === 0 ? -W / 2 : -W, 0, 0);
      parentL.add(h);
      const g = new THREE.PlaneGeometry(W, H);
      g.rotateX(-Math.PI / 2);
      g.translate(-W / 2, 0, 0);
      const m = new THREE.Mesh(g, sideMat);
      this.addEdgeOutline(m, g);
      h.add(m);
      leftHinges.push(h);
      parentL = h;
    }

    // 正六角形の底面（半径 = W、アポセム = W * sqrt(3)/2）
    const apothem = (W * Math.sqrt(3)) / 2;
    const createHexGeom = (zSign: 1 | -1): THREE.BufferGeometry => {
      const shape = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const x = W * Math.cos(ang);
        const y = W * Math.sin(ang);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, zSign * apothem);
      return g;
    };

    const topHinge = new THREE.Group();
    topHinge.position.set(0, 0, -H / 2);
    this.rootObject.add(topHinge);
    const topGeom = createHexGeom(-1);
    const topMesh = new THREE.Mesh(topGeom, capMat);
    this.addEdgeOutline(topMesh, topGeom);
    topHinge.add(topMesh);

    const botHinge = new THREE.Group();
    botHinge.position.set(0, 0, H / 2);
    this.rootObject.add(botHinge);
    const botGeom = createHexGeom(1);
    const botMesh = new THREE.Mesh(botGeom, capMat);
    this.addEdgeOutline(botMesh, botGeom);
    botHinge.add(botMesh);

    this.updateFn = (t: number) => {
      const fold = (Math.PI / 3) * t;
      for (const h of rightHinges) h.rotation.z = fold;
      for (const h of leftHinges) h.rotation.z = -fold;
      topHinge.rotation.x = (Math.PI / 2) * t;
      botHinge.rotation.x = -(Math.PI / 2) * t;
    };
  }

  /** 5. 正四角錐（ピラミッド型） */
  private buildSquarePyramid(): void {
    const S = 1.4; // 底面の1辺
    const slantH = 1.45; // 側面二等辺三角形の高さ
    // 折りたたみ角: cos(theta) = (S/2) / slantH の補角
    const foldAngle = Math.PI - Math.acos(S / 2 / slantH);

    const baseMat = this.createPaperMaterial(0xc5ddd3);
    const sideMat = this.createPaperMaterial(0xffe36e);

    const baseGeom = new THREE.PlaneGeometry(S, S);
    baseGeom.rotateX(-Math.PI / 2);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    this.addEdgeOutline(baseMesh, baseGeom);
    this.rootObject.add(baseMesh);

    // 4方向の三角形ヒンジ
    const dirs: { pos: [number, number, number]; rotY: number }[] = [
      { pos: [0, 0, -S / 2], rotY: 0 },
      { pos: [S / 2, 0, 0], rotY: -Math.PI / 2 },
      { pos: [0, 0, S / 2], rotY: Math.PI },
      { pos: [-S / 2, 0, 0], rotY: Math.PI / 2 },
    ];

    const hinges: THREE.Group[] = [];
    for (const d of dirs) {
      const container = new THREE.Group();
      container.position.set(...d.pos);
      container.rotation.y = d.rotY;
      this.rootObject.add(container);

      const hinge = new THREE.Group();
      container.add(hinge);

      const triGeom = new THREE.BufferGeometry();
      triGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([-S / 2, 0, 0, S / 2, 0, 0, 0, 0, -slantH]),
          3
        )
      );
      triGeom.computeVertexNormals();
      const triMesh = new THREE.Mesh(triGeom, sideMat);
      this.addEdgeOutline(triMesh, triGeom);
      hinge.add(triMesh);
      hinges.push(hinge);
    }

    this.updateFn = (t: number) => {
      const ang = foldAngle * t;
      for (const h of hinges) {
        h.rotation.x = ang;
      }
    };
  }

  /** 6. 正四面体（正三角錐） */
  private buildTetrahedron(): void {
    const S = 1.6;
    const H = (Math.sqrt(3) / 2) * S;
    const rIn = H / 3; // 内接円半径
    const rOut = (2 * H) / 3; // 外接円半径
    const foldAngle = Math.PI - Math.acos(1 / 3);

    const baseMat = this.createPaperMaterial(0xc5ddd3);
    const sideMat = this.createPaperMaterial(0xffe36e);

    // 底面の正三角形（重心を原点とする）
    const p0 = new THREE.Vector3(0, 0, -rOut);
    const p1 = new THREE.Vector3(S / 2, 0, rIn);
    const p2 = new THREE.Vector3(-S / 2, 0, rIn);

    const baseGeom = new THREE.BufferGeometry().setFromPoints([p0, p2, p1]);
    baseGeom.computeVertexNormals();
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    this.addEdgeOutline(baseMesh, baseGeom);
    this.rootObject.add(baseMesh);

    // 3つの辺それぞれに外向き正三角形を配置
    const edges = [
      { a: p2, b: p1 }, // 手前辺
      { a: p1, b: p0 }, // 右奥辺
      { a: p0, b: p2 }, // 左奥辺
    ];

    const hinges: THREE.Group[] = [];
    for (const e of edges) {
      const mid = new THREE.Vector3().addVectors(e.a, e.b).multiplyScalar(0.5);
      const edgeVec = new THREE.Vector3().subVectors(e.b, e.a).normalize();
      const yaw = Math.atan2(edgeVec.z, edgeVec.x);

      const container = new THREE.Group();
      container.position.copy(mid);
      container.rotation.y = -yaw;
      this.rootObject.add(container);

      const hinge = new THREE.Group();
      container.add(hinge);

      const triGeom = new THREE.BufferGeometry();
      triGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([-S / 2, 0, 0, 0, 0, H, S / 2, 0, 0]),
          3
        )
      );
      triGeom.computeVertexNormals();
      const triMesh = new THREE.Mesh(triGeom, sideMat);
      this.addEdgeOutline(triMesh, triGeom);
      hinge.add(triMesh);
      hinges.push(hinge);
    }

    this.updateFn = (t: number) => {
      const ang = -foldAngle * t;
      for (const h of hinges) {
        h.rotation.x = ang;
      }
    };
  }
}
