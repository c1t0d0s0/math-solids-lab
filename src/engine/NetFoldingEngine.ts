import * as THREE from 'three';
import {
  GridCoord,
  FoldingAnalysis,
  analyzeNetFolding,
} from './CubeNetsData';
import { TextureFactory } from '../core/TextureFactory';
import { sound } from '../core/SoundManager';

export interface FaceCustomStyle {
  label?: string;
  subLabel?: string;
  emoji?: string;
  diceValue?: number;
  stampSymbol?: string;
  stampColor?: string;
  fill?: string;
}

interface HingeNode {
  faceIndex: number;
  hingeGroup: THREE.Group;
  centerGroup: THREE.Group;
  axis: 'x' | 'z';
  sign: number;
  maxAngle: number;
  mesh: THREE.Mesh;
  vertexSpheres: THREE.Mesh[];
  edgeCylinders: THREE.Mesh[];
}

const HIGHLIGHT_PALETTE = [
  0xd63c2c, // 赤ペン色
  0x2b6cb0, // 青
  0x2e8b57, // 緑
  0xd97706, // オレンジ
  0x805ad5, // 紫
  0x00a3c4, // シアン
];

export class NetFoldingEngine {
  public rootObject = new THREE.Group();
  public analysis: FoldingAnalysis;
  private cells: GridCoord[];
  private rootIndex: number;
  private nodes = new Map<number, HingeNode>();
  private faceStyles = new Map<number, FaceCustomStyle>();
  private missingSlotGroup = new THREE.Group();
  private foldRatio = 0; // 0..1
  private bouncePhase = 0;
  private wasCollidingLastSet = false;
  private wasCompleteLastSet = false;
  public assistEnabled = true;
  public showInteractivePoints = false;

  // 選択中のハイライト情報
  public selectedFaceIndex: number | null = null;
  public selectedVertexGroupIdx: number | null = null;
  public selectedEdgeGroupIdx: number | null = null;

  constructor(
    cells: GridCoord[],
    rootIndex = 0,
    styles?: Map<number, FaceCustomStyle>,
    options?: { showInteractivePoints?: boolean; customFoldAngle?: number }
  ) {
    this.cells = cells;
    this.rootIndex = rootIndex;
    if (styles) {
      this.faceStyles = new Map(styles);
    }
    this.showInteractivePoints = options?.showInteractivePoints ?? false;
    this.analysis = analyzeNetFolding(cells, rootIndex);
    this.buildHierarchy(options?.customFoldAngle ?? Math.PI / 2);
  }

  private buildHierarchy(targetAngle: number): void {
    this.rootObject.clear();
    this.nodes.clear();
    this.missingSlotGroup.clear();

    if (this.cells.length === 0) return;

    const safeRoot = Math.min(Math.max(0, this.rootIndex), this.cells.length - 1);
    const rootCoord = this.cells[safeRoot];

    // ルート面のピボット
    const rootPivot = new THREE.Group();
    this.rootObject.add(rootPivot);

    const rootMesh = this.createFaceMesh(safeRoot, safeRoot === this.rootIndex);
    rootPivot.add(rootMesh);

    const rootNode: HingeNode = {
      faceIndex: safeRoot,
      hingeGroup: rootPivot,
      centerGroup: rootPivot,
      axis: 'x',
      sign: 0,
      maxAngle: 0,
      mesh: rootMesh,
      vertexSpheres: this.createCornerSpheres(safeRoot, rootPivot),
      edgeCylinders: this.createEdgeCylinders(safeRoot, rootPivot),
    };
    this.nodes.set(safeRoot, rootNode);

    // BFS で隣接面をヒンジ連結
    const visited = new Set<number>([safeRoot]);
    const queue: number[] = [safeRoot];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currCoord = this.cells[curr];
      const currNode = this.nodes.get(curr)!;

      for (let i = 0; i < this.cells.length; i++) {
        if (visited.has(i)) continue;
        const nextCoord = this.cells[i];
        const dx = nextCoord.x - currCoord.x;
        const dz = nextCoord.z - currCoord.z;

        if (Math.abs(dx) + Math.abs(dz) === 1) {
          visited.add(i);
          queue.push(i);

          // 親面の中心 (currNode.centerGroup) から見て共有辺の位置にヒンジグループを配置
          const hingeGroup = new THREE.Group();
          hingeGroup.position.set(dx * 0.5, 0, dz * 0.5);
          currNode.centerGroup.add(hingeGroup);

          // ヒンジから見た子面の中心はさらに (dx*0.5, 0, dz*0.5)
          const childCenterGroup = new THREE.Group();
          childCenterGroup.position.set(dx * 0.5, 0, dz * 0.5);
          hingeGroup.add(childCenterGroup);

          const mesh = this.createFaceMesh(i, false);
          childCenterGroup.add(mesh);

          // 回転軸と向きの設定（+Y方向＝上側へ折れ曲がるように）
          const axis: 'x' | 'z' = dx !== 0 ? 'z' : 'x';
          const sign = dx === 1 ? 1 : dx === -1 ? -1 : dz === 1 ? -1 : 1;

          const vSpheres = this.createCornerSpheres(i, childCenterGroup);
          const eCyls = this.createEdgeCylinders(i, childCenterGroup);

          this.nodes.set(i, {
            faceIndex: i,
            hingeGroup,
            centerGroup: childCenterGroup,
            axis,
            sign,
            maxAngle: targetAngle,
            mesh,
            vertexSpheres: vSpheres,
            edgeCylinders: eCyls,
          });
        }
      }
    }

    // 連結していない孤立セルも平置きで表示（サンドボックス用）
    for (let i = 0; i < this.cells.length; i++) {
      if (visited.has(i)) continue;
      const c = this.cells[i];
      const isolatedGroup = new THREE.Group();
      isolatedGroup.position.set(c.x - rootCoord.x, 0, c.z - rootCoord.z);
      this.rootObject.add(isolatedGroup);
      const mesh = this.createFaceMesh(i, false);
      isolatedGroup.add(mesh);
      this.nodes.set(i, {
        faceIndex: i,
        hingeGroup: isolatedGroup,
        centerGroup: isolatedGroup,
        axis: 'x',
        sign: 0,
        maxAngle: 0,
        mesh,
        vertexSpheres: this.createCornerSpheres(i, isolatedGroup),
        edgeCylinders: this.createEdgeCylinders(i, isolatedGroup),
      });
    }

    // 失敗展開図のときに「穴が空いている面」を示す赤点線フレームを作成
    this.buildMissingSlotIndicators();
    this.rootObject.add(this.missingSlotGroup);
  }

  private createFaceMesh(faceIndex: number, isRoot: boolean): THREE.Mesh {
    const geom = new THREE.BoxGeometry(0.96, 0.04, 0.96);
    const style = this.faceStyles.get(faceIndex) ?? {};
    const tex = TextureFactory.createFaceTexture({
      fill: style.fill ?? (isRoot ? '#fff5c2' : '#fdfdfa'),
      border: '#1c2a4a',
      label: style.label,
      subLabel: style.subLabel ?? (isRoot ? '底' : `${faceIndex + 1}`),
      emoji: style.emoji,
      diceValue: style.diceValue,
      stampSymbol: style.stampSymbol,
      stampColor: style.stampColor,
    });

    const sideMat = new THREE.MeshLambertMaterial({ color: 0x1c2a4a });
    const faceMat = new THREE.MeshLambertMaterial({ map: tex });

    const materials = [sideMat, sideMat, faceMat, faceMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(geom, materials);
    mesh.userData = { kind: 'face', faceIndex };
    return mesh;
  }

  private createCornerSpheres(faceIndex: number, parentGroup: THREE.Group): THREE.Mesh[] {
    const offsets: [number, number][] = [
      [-0.46, -0.46],
      [0.46, -0.46],
      [0.46, 0.46],
      [-0.46, 0.46],
    ];
    return offsets.map(([ox, oz], cornerIndex) => {
      const spGeom = new THREE.SphereGeometry(this.showInteractivePoints ? 0.11 : 0.075, 16, 16);
      const spMat = new THREE.MeshLambertMaterial({
        color: 0x6aa893,
        transparent: true,
        opacity: this.showInteractivePoints ? 0.92 : 0.0,
      });
      const sp = new THREE.Mesh(spGeom, spMat);
      sp.position.set(ox, 0.04, oz);
      sp.userData = { kind: 'vertex', faceIndex, cornerIndex };
      parentGroup.add(sp);
      return sp;
    });
  }

  private createEdgeCylinders(faceIndex: number, parentGroup: THREE.Group): THREE.Mesh[] {
    // 0: 奥辺(-z), 1: 右辺(+x), 2: 手前辺(+z), 3: 左辺(-x)
    const configs: { pos: [number, number]; rotZ: number; rotX: number }[] = [
      { pos: [0, -0.47], rotZ: Math.PI / 2, rotX: 0 },
      { pos: [0.47, 0], rotZ: 0, rotX: Math.PI / 2 },
      { pos: [0, 0.47], rotZ: Math.PI / 2, rotX: 0 },
      { pos: [-0.47, 0], rotZ: 0, rotX: Math.PI / 2 },
    ];
    return configs.map((cfg, edgeIndex) => {
      const cylGeom = new THREE.CylinderGeometry(0.055, 0.055, 0.72, 12);
      const cylMat = new THREE.MeshLambertMaterial({
        color: 0x6aa893,
        transparent: true,
        opacity: 0.0,
      });
      const cyl = new THREE.Mesh(cylGeom, cylMat);
      cyl.position.set(cfg.pos[0], 0.04, cfg.pos[1]);
      cyl.rotation.set(cfg.rotX, 0, cfg.rotZ);
      cyl.userData = { kind: 'edge', faceIndex, edgeIndex };
      parentGroup.add(cyl);
      return cyl;
    });
  }

  private buildMissingSlotIndicators(): void {
    if (this.analysis.missingSlots.length === 0 || this.cells.length < 5) return;

    const slotTransform: Record<string, { pos: [number, number, number]; rot: [number, number, number] }> = {
      TOP: { pos: [0, 1, 0], rot: [0, 0, 0] },
      FRONT: { pos: [0, 0.5, 0.5], rot: [Math.PI / 2, 0, 0] },
      BACK: { pos: [0, 0.5, -0.5], rot: [Math.PI / 2, 0, 0] },
      LEFT: { pos: [-0.5, 0.5, 0], rot: [0, 0, Math.PI / 2] },
      RIGHT: { pos: [0.5, 0.5, 0], rot: [0, 0, Math.PI / 2] },
    };

    for (const slot of this.analysis.missingSlots) {
      const tf = slotTransform[slot];
      if (!tf) continue;
      const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.92, 0.92));
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xd63c2c,
        dashSize: 0.12,
        gapSize: 0.08,
      });
      const line = new THREE.LineSegments(edges, lineMat);
      line.computeLineDistances();
      line.position.set(...tf.pos);
      line.rotation.set(tf.rot[0] + Math.PI / 2, tf.rot[1], tf.rot[2]);
      this.missingSlotGroup.add(line);
    }
    this.missingSlotGroup.visible = false;
  }

  /** スライダー値 (0..100) を反映する */
  public setFoldProgress(percent: number, silent = false): {
    effectivePercent: number;
    isColliding: boolean;
    isComplete: boolean;
  } {
    const targetRatio = Math.min(1, Math.max(0, percent / 100));
    const hasCollision = this.analysis.collidingFacePairs.length > 0;
    const collisionLimit = 0.78; // 失敗展開図は78%のところで面どうしがぶつかって弾かれる

    let effectiveRatio = targetRatio;
    let isColliding = false;

    if (hasCollision && targetRatio >= collisionLimit) {
      isColliding = true;
      // ぶつかって少し押し戻されるバウンス感
      const over = (targetRatio - collisionLimit) / (1 - collisionLimit);
      const bounce = Math.sin(over * Math.PI * 3) * 0.06;
      effectiveRatio = collisionLimit - Math.abs(bounce);
      if (!this.wasCollidingLastSet && !silent) {
        sound.playCollision();
        this.bouncePhase = 1.0;
      }
    }

    this.wasCollidingLastSet = isColliding;
    this.foldRatio = effectiveRatio;

    const isComplete = !hasCollision && this.analysis.isValidCube && targetRatio >= 0.99;
    if (isComplete && !this.wasCompleteLastSet && !silent) {
      sound.playSnapComplete();
    }
    this.wasCompleteLastSet = isComplete;

    this.applyRotations(effectiveRatio, isColliding);
    this.missingSlotGroup.visible = isColliding || (targetRatio >= 0.85 && this.analysis.missingSlots.length > 0);

    return {
      effectivePercent: Math.round(effectiveRatio * 100),
      isColliding,
      isComplete,
    };
  }

  private applyRotations(ratio: number, isColliding: boolean): void {
    const collidingSet = new Set(this.analysis.collidingFaceIndices);

    this.nodes.forEach((node, idx) => {
      if (node.sign !== 0) {
        let angle = node.sign * node.maxAngle * ratio;
        if (isColliding && collidingSet.has(idx)) {
          angle += Math.sin(performance.now() * 0.035) * 0.08 * node.sign;
        }
        if (node.axis === 'x') {
          node.hingeGroup.rotation.x = angle;
        } else {
          node.hingeGroup.rotation.z = angle;
        }
      }

      // 衝突している面を赤くハイライト
      const mats = node.mesh.material as THREE.MeshLambertMaterial[];
      if (isColliding && collidingSet.has(idx)) {
        mats[2].emissive.setHex(0x881111);
        mats[3].emissive.setHex(0x881111);
      } else {
        mats[2].emissive.setHex(0x000000);
        mats[3].emissive.setHex(0x000000);
      }
    });

    this.refreshCorrespondenceHighlights();
  }

  /** 毎フレームのバウンス減衰アニメーション更新 */
  public updateFrame(dt: number): void {
    if (this.bouncePhase > 0) {
      this.bouncePhase = Math.max(0, this.bouncePhase - dt * 2.5);
      if (this.wasCollidingLastSet) {
        this.applyRotations(this.foldRatio, true);
      }
    }
  }

  /** 面スタイルの更新 */
  public updateFaceStyle(faceIndex: number, style: FaceCustomStyle): void {
    this.faceStyles.set(faceIndex, style);
    const node = this.nodes.get(faceIndex);
    if (!node) return;
    const isRoot = faceIndex === this.rootIndex;
    const tex = TextureFactory.createFaceTexture({
      fill: style.fill ?? (isRoot ? '#fff5c2' : '#fdfdfa'),
      border: '#1c2a4a',
      label: style.label,
      subLabel: style.subLabel ?? (isRoot ? '底' : `${faceIndex + 1}`),
      emoji: style.emoji,
      diceValue: style.diceValue,
      stampSymbol: style.stampSymbol,
      stampColor: style.stampColor,
    });
    const mats = node.mesh.material as THREE.MeshLambertMaterial[];
    mats[2].map = tex;
    mats[3].map = tex;
    mats[2].needsUpdate = true;
    mats[3].needsUpdate = true;
  }

  /** タップされた3Dオブジェクトに応じて面・辺・頂点の対応ハイライトを切り替える */
  public handleObjectTap(obj: THREE.Object3D): {
    type: 'face' | 'vertex' | 'edge' | null;
    faceIndex?: number;
    cornerIndex?: number;
    edgeIndex?: number;
  } {
    const data = obj.userData;
    if (!data || !data.kind) return { type: null };

    if (data.kind === 'vertex') {
      const fIdx = data.faceIndex as number;
      const cIdx = data.cornerIndex as number;
      const gIdx = this.analysis.vertexGroups.findIndex(g =>
        g.members.some(m => m.faceIndex === fIdx && m.cornerIndex === cIdx)
      );
      this.selectedVertexGroupIdx = gIdx >= 0 ? gIdx : null;
      this.selectedFaceIndex = null;
      this.selectedEdgeGroupIdx = null;
      this.refreshCorrespondenceHighlights();
      return { type: 'vertex', faceIndex: fIdx, cornerIndex: cIdx };
    }

    if (data.kind === 'edge') {
      const fIdx = data.faceIndex as number;
      const eIdx = data.edgeIndex as number;
      const gIdx = this.analysis.edgeGroups.findIndex(g =>
        g.members.some(m => m.faceIndex === fIdx && m.edgeIndex === eIdx)
      );
      this.selectedEdgeGroupIdx = gIdx >= 0 ? gIdx : null;
      this.selectedFaceIndex = null;
      this.selectedVertexGroupIdx = null;
      this.refreshCorrespondenceHighlights();
      return { type: 'edge', faceIndex: fIdx, edgeIndex: eIdx };
    }

    if (data.kind === 'face') {
      const fIdx = data.faceIndex as number;
      this.selectedFaceIndex = this.selectedFaceIndex === fIdx ? null : fIdx;
      this.selectedVertexGroupIdx = null;
      this.selectedEdgeGroupIdx = null;
      this.refreshCorrespondenceHighlights();
      return { type: 'face', faceIndex: fIdx };
    }

    return { type: null };
  }

  /** 特定の頂点や辺を外部からハイライト指定する（頂点マッチング問題用） */
  public highlightSpecificVertex(
    target: { faceIndex: number; cornerIndex: number },
    userSelections: { faceIndex: number; cornerIndex: number }[] = []
  ): void {
    this.nodes.forEach(node => {
      node.vertexSpheres.forEach((sp, cIdx) => {
        const mat = sp.material as THREE.MeshLambertMaterial;
        const isTarget = node.faceIndex === target.faceIndex && cIdx === target.cornerIndex;
        const isSelected = userSelections.some(
          s => s.faceIndex === node.faceIndex && s.cornerIndex === cIdx
        );
        if (isTarget) {
          mat.color.setHex(0xd63c2c);
          mat.opacity = 1.0;
          sp.scale.setScalar(1.55);
        } else if (isSelected) {
          mat.color.setHex(0xffb700);
          mat.opacity = 1.0;
          sp.scale.setScalar(1.4);
        } else {
          mat.color.setHex(0x6aa893);
          mat.opacity = 0.85;
          sp.scale.setScalar(1.0);
        }
      });
    });
  }

  /** 対応ハイライト（アシスト機能）の表示更新 */
  public refreshCorrespondenceHighlights(): void {
    // まずリセット
    this.nodes.forEach(node => {
      const mats = node.mesh.material as THREE.MeshLambertMaterial[];
      if (!this.wasCollidingLastSet) {
        mats[2].emissive.setHex(0x000000);
        mats[3].emissive.setHex(0x000000);
      }
      if (!this.showInteractivePoints) {
        node.vertexSpheres.forEach(sp => {
          (sp.material as THREE.MeshLambertMaterial).opacity = 0;
          sp.scale.setScalar(1);
        });
      }
      node.edgeCylinders.forEach(cyl => {
        (cyl.material as THREE.MeshLambertMaterial).opacity = 0;
      });
    });

    if (!this.assistEnabled) return;

    // 1. 面が選択されているとき：向かい合う面ペア、およびその面の4頂点・4辺と重なる相手を色分け発光
    if (this.selectedFaceIndex !== null) {
      const selIdx = this.selectedFaceIndex;
      const selNode = this.nodes.get(selIdx);
      if (selNode) {
        const mats = selNode.mesh.material as THREE.MeshLambertMaterial[];
        mats[2].emissive.setHex(0x3a3200);
        mats[3].emissive.setHex(0x3a3200);
      }

      // 向かい合う面（平行対面）も光らせる
      for (const [a, b] of this.analysis.oppositePairs) {
        const partner = a === selIdx ? b : b === selIdx ? a : null;
        if (partner !== null) {
          const pNode = this.nodes.get(partner);
          if (pNode) {
            const pMats = pNode.mesh.material as THREE.MeshLambertMaterial[];
            pMats[2].emissive.setHex(0x1b4332);
            pMats[3].emissive.setHex(0x1b4332);
          }
        }
      }

      // 選択面の4つの辺と重なる相手の辺をペアごとに同じ色でハイライト
      for (let eIdx = 0; eIdx < 4; eIdx++) {
        const color = HIGHLIGHT_PALETTE[eIdx % HIGHLIGHT_PALETTE.length];
        const group = this.analysis.edgeGroups.find(g =>
          g.members.some(m => m.faceIndex === selIdx && m.edgeIndex === eIdx)
        );
        if (group && group.members.length > 1) {
          for (const m of group.members) {
            const n = this.nodes.get(m.faceIndex);
            const cyl = n?.edgeCylinders[m.edgeIndex];
            if (cyl) {
              const mat = cyl.material as THREE.MeshLambertMaterial;
              mat.color.setHex(color);
              mat.opacity = 0.95;
            }
          }
        }
      }
    }

    // 2. 特定の頂点グループが選択されているとき
    if (this.selectedVertexGroupIdx !== null) {
      const group = this.analysis.vertexGroups[this.selectedVertexGroupIdx];
      if (group) {
        for (const m of group.members) {
          const n = this.nodes.get(m.faceIndex);
          const sp = n?.vertexSpheres[m.cornerIndex];
          if (sp) {
            const mat = sp.material as THREE.MeshLambertMaterial;
            mat.color.setHex(0xd63c2c);
            mat.opacity = 1.0;
            sp.scale.setScalar(1.45);
          }
        }
      }
    }

    // 3. 特定の辺グループが選択されているとき
    if (this.selectedEdgeGroupIdx !== null) {
      const group = this.analysis.edgeGroups[this.selectedEdgeGroupIdx];
      if (group) {
        for (const m of group.members) {
          const n = this.nodes.get(m.faceIndex);
          const cyl = n?.edgeCylinders[m.edgeIndex];
          if (cyl) {
            const mat = cyl.material as THREE.MeshLambertMaterial;
            mat.color.setHex(0xd63c2c);
            mat.opacity = 1.0;
          }
        }
      }
    }
  }
}
