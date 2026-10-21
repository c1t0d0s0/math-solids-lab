import * as THREE from 'three';
import { LabModeController, LabUIHooks } from './LabModeBase';
import { SceneManager } from '../core/SceneManager';
import {
  CurvedAndPolySolidsEngine,
  SOLID_CRAFT_LIST,
  SolidCraftType,
} from '../engine/CurvedAndPolySolidsEngine';
import { computeCubeCrossSection } from '../engine/CrossSectionEngine';
import { sound } from '../core/SoundManager';
import { progressStore } from '../core/ProgressStore';
import { renderHanamaruSvg } from '../core/SvgIcons';

interface RevolvePreset {
  id: string;
  name: string;
  planeDesc: string;
  answerSolid: string;
  options: string[];
  points2D: [number, number][]; // [r (x>=0), y]
}

const REVOLVE_PRESETS: RevolvePreset[] = [
  {
    id: 'rect',
    name: '① 長方形を回すと？',
    planeDesc: '回転の棒（軸）にぴったりくっついた「長方形」',
    answerSolid: '円柱（えんちゅう）',
    options: ['円柱（えんちゅう）', '円錐（えんすい）', '球（きゅう）', '四角柱'],
    points2D: [
      [0.01, -1.1],
      [1.1, -1.1],
      [1.1, 1.1],
      [0.01, 1.1],
      [0.01, -1.1],
    ],
  },
  {
    id: 'triangle',
    name: '② 直角三角形を回すと？',
    planeDesc: '回転の棒に直角の辺がくっついた「直角三角形」',
    answerSolid: '円錐（えんすい）',
    options: ['三角錐', '円錐（えんすい）', '円柱（えんちゅう）', '球（きゅう）'],
    points2D: [
      [0.01, -1.1],
      [1.2, -1.1],
      [0.01, 1.2],
      [0.01, -1.1],
    ],
  },
  {
    id: 'semicircle',
    name: '③ 半円を回すと？',
    planeDesc: '回転の棒に直径がくっついた「半円（はんえん）」',
    answerSolid: '球（きゅう・ボール型）',
    options: ['円柱（えんちゅう）', '円錐（えんすい）', '球（きゅう・ボール型）', 'ドーナツ型'],
    points2D: Array.from({ length: 21 }, (_, i) => {
      const ang = -Math.PI / 2 + (i / 20) * Math.PI;
      return [Math.max(0.01, 1.15 * Math.cos(ang)), 1.15 * Math.sin(ang)] as [number, number];
    }),
  },
  {
    id: 'trapezoid',
    name: '④ 台形を回すと？',
    planeDesc: '上がせまく下が広い「台形（だいけい）」',
    answerSolid: '円錐台（プリン・バケツ型）',
    options: ['円錐台（プリン・バケツ型）', '四角錐', '球（きゅう）', '三角柱'],
    points2D: [
      [0.01, -1.1],
      [1.25, -1.1],
      [0.65, 1.0],
      [0.01, 1.0],
      [0.01, -1.1],
    ],
  },
  {
    id: 'hollow-rect',
    name: '⑤ 棒から離れた長方形を回すと？',
    planeDesc: '回転の棒から少しすきまを空けて置いた「長方形」',
    answerSolid: '穴あき円柱（ちくわ・バウムクーヘン型）',
    options: ['ふつうの円柱', '穴あき円柱（ちくわ・バウムクーヘン型）', '円錐（えんすい）', '球（きゅう）'],
    points2D: [
      [0.5, -1.0],
      [1.25, -1.0],
      [1.25, 1.0],
      [0.5, 1.0],
      [0.5, -1.0],
    ],
  },
];

export class Grade56Mode implements LabModeController {
  private submode: 'craft' | 'revolve' | 'cutter';
  private sceneManager!: SceneManager;
  private controlPanel!: HTMLElement;
  private hooks!: LabUIHooks;

  // 1. 曲面・多角形クラフト
  private craftEngine: CurvedAndPolySolidsEngine | null = null;
  private activeCraftType: SolidCraftType = 'cylinder';
  private observedCrafts = new Set<SolidCraftType>(['cylinder']);

  // 2. 回転体レーサー
  private revolveIdx = 0;
  private revolveProgress = 0; // 0..100 (0度〜360度)
  private isSpinning = false;
  private spinSpeed = 0;
  private revolveAnswered: string | null = null;
  private revolveScore = 0;
  private revolveSweepGroup = new THREE.Group();
  private revolveBladeGroup = new THREE.Group();

  // 3. 立体カッター（切断面）
  private cutOffset = 0.0; // -1.4 .. 1.4
  private cutAngleX = 0;   // -65 .. 65 deg
  private cutAngleZ = 0;   // -65 .. 65 deg
  private cutterGroup = new THREE.Group();

  constructor(initialSubmode: 'craft' | 'revolve' | 'cutter' = 'craft') {
    this.submode = initialSubmode;
  }

  public mount(sceneManager: SceneManager, controlPanel: HTMLElement, hooks: LabUIHooks): void {
    this.sceneManager = sceneManager;
    this.controlPanel = controlPanel;
    this.hooks = hooks;

    if (this.submode === 'craft') {
      this.initCraftMode(this.activeCraftType);
    } else if (this.submode === 'revolve') {
      this.initRevolveMode(this.revolveIdx);
    } else {
      this.initCutterMode();
    }
  }

  public onSliderChange(percent: number): void {
    sound.playSliderTick(percent);
    if (this.submode === 'craft' && this.craftEngine) {
      this.craftEngine.setFoldProgress(percent);
      if (percent >= 98) {
        this.observedCrafts.add(this.activeCraftType);
        progressStore.setMaxScore('g56-craft', this.observedCrafts.size);
        sound.playSnapComplete();
        this.hooks.setViewportBadge('100% 組み立て完了！いろいろな角度から見てみよう', 'ok');
        this.renderCraftUI();
      } else {
        this.hooks.setViewportBadge('スライダーで曲面や多角形が折りたたまれる様子を観察しよう', 'normal');
      }
    } else if (this.submode === 'revolve') {
      this.revolveProgress = percent;
      this.rebuildRevolveSweep(percent / 100);
    } else if (this.submode === 'cutter') {
      // カッターモードでは下部スライダーを「切る高さ（オフセット）」と連動させる
      this.cutOffset = ((percent - 50) / 50) * 1.35;
      this.rebuildCutterScene();
      this.renderCutterUI();
    }
  }

  public onAssistToggle(_enabled: boolean): void {
    // 高学年モードは常時ガイドライン表示
  }

  public dispose(): void {
    this.sceneManager.clearRoot();
  }

  // =========================================================
  // 1. 曲面・多角形の展開図（角柱・円柱・角錐・円錐）
  // =========================================================
  private initCraftMode(type: SolidCraftType): void {
    this.activeCraftType = type;
    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.4, 5.4, 5.8], [0, 0.3, 0]);

    this.craftEngine = new CurvedAndPolySolidsEngine(type);
    this.sceneManager.rootGroup.add(this.craftEngine.rootObject);

    this.hooks.setSliderVisible(true, '組み立てスライダー（0% 展開図 ⇔ 100% 立体）');
    this.hooks.setSliderValue(0);
    const meta = SOLID_CRAFT_LIST.find(m => m.id === type)!;
    this.hooks.setViewportBadge(`${meta.name}：スライダーを動かして組み立てよう！`, 'normal');

    this.renderCraftUI();
  }

  private renderCraftUI(): void {
    const meta = SOLID_CRAFT_LIST.find(m => m.id === this.activeCraftType)!;

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="5・6年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-craft">📐 柱・錐の展開図</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-revolve">🌀 回転体レーサー</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-cutter">🔪 立体カッター</button>
      </div>
      <div class="meter-status">
        <span>観察した立体: <b class="meter-num">${this.observedCrafts.size} / ${SOLID_CRAFT_LIST.length}</b> 種</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>${meta.name}</span>
          <span class="tile-badge">${meta.badge}</span>
        </div>
        <p class="sheet-desc">
          <b>【面の構成】${meta.facesSummary}</b><br>
          ${meta.description}
        </p>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm" id="craft-open">0% ひらく</button>
          <button type="button" class="btn btn-sm" id="craft-half">50% とちゅう</button>
          <button type="button" class="btn btn-sm btn-primary" id="craft-close">100% 組み立てる</button>
        </div>
      </div>

      <div class="sheet-card">
        <div class="sheet-title">
          <span>いろいろな立体をえらぼう</span>
        </div>
        <div class="options-grid">
          ${SOLID_CRAFT_LIST.map(
            item => `
              <button type="button" class="option ${item.id === this.activeCraftType ? 'is-selected' : ''}" data-craft="${item.id}" style="font-size:1.05rem; min-height:2.9rem;">
                ${this.observedCrafts.has(item.id) ? '💮 ' : ''}${item.name}
              </button>
            `
          ).join('')}
        </div>
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelector('#craft-open')?.addEventListener('click', () => {
      this.hooks.setSliderValue(0);
      this.onSliderChange(0);
    });
    this.controlPanel.querySelector('#craft-half')?.addEventListener('click', () => {
      this.hooks.setSliderValue(50);
      this.onSliderChange(50);
    });
    this.controlPanel.querySelector('#craft-close')?.addEventListener('click', () => {
      this.hooks.setSliderValue(100);
      this.onSliderChange(100);
    });

    this.controlPanel.querySelectorAll('[data-craft]').forEach(btn => {
      btn.addEventListener('click', e => {
        const t = (e.currentTarget as HTMLElement).dataset.craft as SolidCraftType;
        sound.playPop();
        this.initCraftMode(t);
      });
    });
  }

  // =========================================================
  // 2. ぐるぐる回転体レーサー
  // =========================================================
  private initRevolveMode(idx: number): void {
    this.revolveIdx = idx % REVOLVE_PRESETS.length;
    this.revolveProgress = 0;
    this.isSpinning = false;
    this.spinSpeed = 0;
    this.revolveAnswered = null;

    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.2, 3.6, 5.2], [0, 0.1, 0]);

    // 中心の回転軸（赤い棒）
    const rodGeom = new THREE.CylinderGeometry(0.045, 0.045, 3.4, 16);
    const rodMat = new THREE.MeshLambertMaterial({ color: 0xd63c2c });
    const rodMesh = new THREE.Mesh(rodGeom, rodMat);
    this.sceneManager.rootGroup.add(rodMesh);

    this.revolveSweepGroup = new THREE.Group();
    this.revolveBladeGroup = new THREE.Group();
    this.sceneManager.rootGroup.add(this.revolveSweepGroup);
    this.sceneManager.rootGroup.add(this.revolveBladeGroup);

    this.buildRevolveBlade();
    this.rebuildRevolveSweep(0);

    this.hooks.setSliderVisible(true, '回転スライダー（0% 平面 ⇔ 100% 1回転の軌跡）');
    this.hooks.setSliderValue(0);
    this.hooks.setViewportBadge('「🌀 高速スピン！」ボタンかスライダーで回してみよう', 'normal');

    this.sceneManager.onFrame(dt => {
      if (this.isSpinning) {
        this.revolveBladeGroup.rotation.y += this.spinSpeed * dt;
        if (this.revolveProgress < 100) {
          this.revolveProgress = Math.min(100, this.revolveProgress + dt * 75);
          this.hooks.setSliderValue(Math.round(this.revolveProgress));
          this.rebuildRevolveSweep(this.revolveProgress / 100);
          if (this.revolveProgress >= 100) {
            sound.playSnapComplete();
          }
        }
      }
    });

    this.renderRevolveUI();
  }

  private buildRevolveBlade(): void {
    this.revolveBladeGroup.clear();
    const preset = REVOLVE_PRESETS[this.revolveIdx];
    const shape = new THREE.Shape();
    preset.points2D.forEach(([x, y], i) => {
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });

    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffe36e,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const edges = new THREE.EdgesGeometry(geom);
    mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1c2a4a })));
    this.revolveBladeGroup.add(mesh);
  }

  private rebuildRevolveSweep(ratio: number): void {
    this.revolveSweepGroup.clear();
    if (ratio <= 0.01) return;

    const preset = REVOLVE_PRESETS[this.revolveIdx];
    const lathePts = preset.points2D.map(([x, y]) => new THREE.Vector2(x, y));
    const phiLength = ratio * Math.PI * 2;
    const segments = Math.max(6, Math.round(ratio * 42));

    const latheGeom = new THREE.LatheGeometry(lathePts, segments, 0, phiLength);
    const latheMat = new THREE.MeshLambertMaterial({
      color: 0x6aa893,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const latheMesh = new THREE.Mesh(latheGeom, latheMat);
    this.revolveSweepGroup.add(latheMesh);

    const wireEdges = new THREE.EdgesGeometry(latheGeom, 25);
    const wire = new THREE.LineSegments(wireEdges, new THREE.LineBasicMaterial({ color: 0x1c2a4a }));
    this.revolveSweepGroup.add(wire);

    if (!this.isSpinning) {
      this.revolveBladeGroup.rotation.y = phiLength;
    }
  }

  private renderRevolveUI(): void {
    const preset = REVOLVE_PRESETS[this.revolveIdx];
    const isAnswered = this.revolveAnswered !== null;
    const isCorrect = this.revolveAnswered === preset.answerSolid;

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="5・6年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-craft">📐 柱・錐の展開図</button>
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-revolve">🌀 回転体レーサー</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-cutter">🔪 立体カッター</button>
      </div>
      <div class="meter-status">
        <span>クリア数: <b class="meter-num">${this.revolveScore}</b> 問</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>${preset.name}</span>
          <span class="tile-badge">ステージ ${this.revolveIdx + 1} / ${REVOLVE_PRESETS.length}</span>
        </div>
        <p class="sheet-desc">
          赤い回転軸に取りつけた <b>${preset.planeDesc}</b> をコマのようにぐるっと1回転させると、どんな立体が浮かび上がるかな？
        </p>

        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button type="button" class="btn btn-accent" id="btn-spin">
            🌀 高速スピン！（コマ回転）
          </button>
          <button type="button" class="btn btn-sm" id="btn-reset-spin">
            ⏹️ 0%（平面）にもどす
          </button>
        </div>

        <div class="options-grid">
          ${preset.options
            .map(opt => {
              let cls = 'option';
              if (isAnswered) {
                if (opt === preset.answerSolid) cls += ' correct';
                else if (opt === this.revolveAnswered) cls += ' incorrect';
              }
              return `
                <button type="button" class="${cls}" data-rev-ans="${opt}" ${isAnswered ? 'disabled' : ''} style="font-size:1.05rem;">
                  ${opt}
                </button>
              `;
            })
            .join('')}
        </div>

        ${
          isAnswered
            ? `
          <div class="feedback-box ${isCorrect ? '' : 'is-ng'}">
            ${isCorrect ? renderHanamaruSvg('hanamaru', true) : ''}
            <div class="feedback-text">
              <div class="feedback-verdict">${
                isCorrect ? 'せいかい！見事に回転体ができたね！' : `こたえは「${preset.answerSolid}」だよ！`
              }</div>
              <div class="feedback-detail">
                平面の図形が通ったあと（軌跡）がつながって、なめらかな曲面をもつ立体になるよ。
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button type="button" class="btn btn-primary" id="next-revolve">つぎの回転体へ ▶</button>
          </div>
          `
            : ''
        }
      </div>

      <div class="sheet-card">
        <div class="sheet-title"><span>平面図形をえらぶ</span></div>
        <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
          ${REVOLVE_PRESETS.map(
            (p, idx) => `
              <button type="button" class="btn btn-sm ${idx === this.revolveIdx ? 'btn-active' : ''}" data-rev-preset="${idx}">
                ${p.name}
              </button>
            `
          ).join('')}
        </div>
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelector('#btn-spin')?.addEventListener('click', () => {
      this.isSpinning = true;
      this.spinSpeed = 10.5;
      sound.playPop();
    });

    this.controlPanel.querySelector('#btn-reset-spin')?.addEventListener('click', () => {
      this.isSpinning = false;
      this.revolveProgress = 0;
      this.revolveBladeGroup.rotation.y = 0;
      this.hooks.setSliderValue(0);
      this.rebuildRevolveSweep(0);
    });

    this.controlPanel.querySelectorAll('[data-rev-ans]').forEach(btn => {
      btn.addEventListener('click', e => {
        const ans = (e.currentTarget as HTMLElement).dataset.revAns!;
        this.revolveAnswered = ans;
        if (ans === preset.answerSolid) {
          this.revolveScore++;
          sound.playCorrect();
          progressStore.addScore('g56-revolve', 1);
        } else {
          sound.playCollision();
        }
        this.isSpinning = true;
        this.spinSpeed = 9.0;
        this.renderRevolveUI();
      });
    });

    this.controlPanel.querySelector('#next-revolve')?.addEventListener('click', () => {
      this.initRevolveMode(this.revolveIdx + 1);
    });

    this.controlPanel.querySelectorAll('[data-rev-preset]').forEach(btn => {
      btn.addEventListener('click', e => {
        const i = Number((e.currentTarget as HTMLElement).dataset.revPreset);
        sound.playPop();
        this.initRevolveMode(i);
      });
    });
  }

  // =========================================================
  // 3. 立体カッター（切断面ラボ）
  // =========================================================
  private initCutterMode(): void {
    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.2, 4.0, 5.2], [0, 0, 0]);

    this.cutterGroup = new THREE.Group();
    this.sceneManager.rootGroup.add(this.cutterGroup);

    this.hooks.setSliderVisible(true, 'カッターの高さスライダー（0% 下 ⇔ 100% 上）');
    this.hooks.setSliderValue(50);

    this.rebuildCutterScene();
    this.renderCutterUI();
  }

  private getNormalVector(): { x: number; y: number; z: number } {
    const rx = (this.cutAngleX * Math.PI) / 180;
    const rz = (this.cutAngleZ * Math.PI) / 180;
    const v = new THREE.Vector3(0, 1, 0);
    const euler = new THREE.Euler(rx, 0, rz, 'XYZ');
    v.applyEuler(euler).normalize();
    return { x: v.x, y: v.y, z: v.z };
  }

  private rebuildCutterScene(): void {
    this.cutterGroup.clear();
    const n = this.getNormalVector();
    const threeNormal = new THREE.Vector3(-n.x, -n.y, -n.z);
    const clipPlane = new THREE.Plane(threeNormal, this.cutOffset);

    // 1. 切断された下側の立方体本体
    const cubeGeom = new THREE.BoxGeometry(2, 2, 2);
    const cubeMat = new THREE.MeshLambertMaterial({
      color: 0xc5ddd3,
      clippingPlanes: [clipPlane],
      side: THREE.DoubleSide,
    });
    const cubeMesh = new THREE.Mesh(cubeGeom, cubeMat);
    this.cutterGroup.add(cubeMesh);

    // 立方体全体のワイヤーフレーム（元の形がわかるように）
    const edges = new THREE.EdgesGeometry(cubeGeom);
    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1c2a4a }));
    this.cutterGroup.add(wire);

    // 2. 切り口（断面ポリゴン）の計算と赤ペン色ハイライトメッシュ描画
    const res = computeCubeCrossSection(n, this.cutOffset);
    if (res.vertexCount >= 3) {
      progressStore.markCutShapeFound(res.shapeName);
      progressStore.setMaxScore('g56-cutter', progressStore.getCutShapesFound().length);

      // 3D断面ポリゴンを三角形分割してメッシュ化
      const positions: number[] = [];
      const p0 = res.points3D[0];
      for (let i = 1; i < res.points3D.length - 1; i++) {
        const p1 = res.points3D[i];
        const p2 = res.points3D[i + 1];
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
      const secGeom = new THREE.BufferGeometry();
      secGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      secGeom.computeVertexNormals();

      const secMat = new THREE.MeshBasicMaterial({
        color: 0xffe36e,
        side: THREE.DoubleSide,
      });
      const secMesh = new THREE.Mesh(secGeom, secMat);
      this.cutterGroup.add(secMesh);

      // 断面の太い赤枠ライン
      const loopPts = [...res.points3D, res.points3D[0]].map(
        p => new THREE.Vector3(p.x, p.y, p.z)
      );
      const lineGeom = new THREE.BufferGeometry().setFromPoints(loopPts);
      const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xd63c2c }));
      this.cutterGroup.add(line);

      // 断面の頂点に赤いドット球を配置
      for (const p of res.points3D) {
        const sp = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xd63c2c })
        );
        sp.position.set(p.x, p.y, p.z);
        this.cutterGroup.add(sp);
      }

      this.hooks.setViewportBadge(`切り口の形：【${res.shapeName}】（頂点 ${res.vertexCount} こ）`, 'ok');
    } else {
      this.hooks.setViewportBadge('カッターが立方体の外にあります。高さを調整しよう', 'alert');
    }
  }

  private renderCutterUI(): void {
    const n = this.getNormalVector();
    const res = computeCubeCrossSection(n, this.cutOffset);
    const foundShapes = progressStore.getCutShapesFound();

    // 2D SVG プレビュー文字列を作成
    let svgPolygon = '';
    if (res.points2D.length >= 3) {
      const ptsAttr = res.points2D
        .map(p => `${(50 + p.x * 26).toFixed(1)},${(50 - p.y * 26).toFixed(1)}`)
        .join(' ');
      svgPolygon = `<polygon points="${ptsAttr}" fill="#ffe36e" stroke="#d63c2c" stroke-width="3" stroke-linejoin="round" />`;
    }

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="5・6年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-craft">📐 柱・錐の展開図</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-revolve">🌀 回転体レーサー</button>
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-cutter">🔪 立体カッター</button>
      </div>
      <div class="meter-status">
        <span>発見した切り口: <b class="meter-num">${foundShapes.length}</b> 種類</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>切り口の形を観察しよう</span>
          <span class="tile-badge">切断面ラボ</span>
        </div>

        <div class="section-preview-box">
          <svg viewBox="0 0 100 100" style="width:5.2rem; height:5.2rem; flex:none; background:var(--paper); box-shadow:0 0 0 1px var(--rule);">
            ${svgPolygon}
          </svg>
          <div>
            <div style="font-size:0.78rem; color:var(--muted); font-weight:700;">現在の切り口（断面）</div>
            <div class="section-shape-badge">${res.shapeName}</div>
            <div style="font-size:0.82rem; margin-top:0.15rem;">${res.description}</div>
          </div>
        </div>

        <div class="param-row">
          <span class="param-label">切る高さ</span>
          <input type="range" id="cut-offset" min="-135" max="135" value="${Math.round(this.cutOffset * 100)}" class="fold-range" />
          <span class="param-val">${this.cutOffset.toFixed(2)}</span>
        </div>

        <div class="param-row">
          <span class="param-label">たての傾き</span>
          <input type="range" id="cut-ang-x" min="-65" max="65" value="${this.cutAngleX}" class="fold-range" />
          <span class="param-val">${this.cutAngleX}°</span>
        </div>

        <div class="param-row">
          <span class="param-label">よこの傾き</span>
          <input type="range" id="cut-ang-z" min="-65" max="65" value="${this.cutAngleZ}" class="fold-range" />
          <span class="param-val">${this.cutAngleZ}°</span>
        </div>
      </div>

      <div class="sheet-card">
        <div class="sheet-title">
          <span>一発お題プリセット（いろんな切り口を見てみよう）</span>
        </div>
        <div class="palette-row">
          <button type="button" class="btn btn-sm" data-cut-preset="square">🟥 正方形</button>
          <button type="button" class="btn btn-sm" data-cut-preset="rect">🟧 長方形（対角線）</button>
          <button type="button" class="btn btn-sm" data-cut-preset="eq-tri">🔺 正三角形</button>
          <button type="button" class="btn btn-sm" data-cut-preset="iso-tri">📐 二等辺三角形</button>
          <button type="button" class="btn btn-sm" data-cut-preset="pentagon">⬠ 五角形</button>
          <button type="button" class="btn btn-sm btn-primary" data-cut-preset="hexagon">⬢ 正六角形</button>
        </div>
        <p class="sheet-note">
          発見済みコレクション：${
            foundShapes.length > 0
              ? foundShapes.map(s => `<b>【${s}】</b>`).join(' ')
              : 'まだありません'
          }
        </p>
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelector('#cut-offset')?.addEventListener('input', e => {
      const val = Number((e.currentTarget as HTMLInputElement).value);
      this.cutOffset = val / 100;
      const pct = Math.round(((this.cutOffset / 1.35) * 50) + 50);
      this.hooks.setSliderValue(Math.min(100, Math.max(0, pct)));
      this.rebuildCutterScene();
      this.renderCutterUI();
    });

    this.controlPanel.querySelector('#cut-ang-x')?.addEventListener('input', e => {
      this.cutAngleX = Number((e.currentTarget as HTMLInputElement).value);
      this.rebuildCutterScene();
      this.renderCutterUI();
    });

    this.controlPanel.querySelector('#cut-ang-z')?.addEventListener('input', e => {
      this.cutAngleZ = Number((e.currentTarget as HTMLInputElement).value);
      this.rebuildCutterScene();
      this.renderCutterUI();
    });

    this.controlPanel.querySelectorAll('[data-cut-preset]').forEach(btn => {
      btn.addEventListener('click', e => {
        const key = (e.currentTarget as HTMLElement).dataset.cutPreset;
        if (key === 'square') {
          this.cutOffset = 0;
          this.cutAngleX = 0;
          this.cutAngleZ = 0;
        } else if (key === 'rect') {
          this.cutOffset = 0;
          this.cutAngleX = 45;
          this.cutAngleZ = 0;
        } else if (key === 'eq-tri') {
          // 法線 (1,1,1) 方向になるオイラー角: rx = 45°, rz = -35.26°、offset = 0.65
          this.cutAngleX = 45;
          this.cutAngleZ = -35;
          this.cutOffset = 0.65;
        } else if (key === 'iso-tri') {
          this.cutAngleX = 30;
          this.cutAngleZ = -30;
          this.cutOffset = 0.72;
        } else if (key === 'pentagon') {
          this.cutAngleX = 32;
          this.cutAngleZ = -50;
          this.cutOffset = 0.35;
        } else if (key === 'hexagon') {
          // 中心 (offset=0) を法線 (1,1,1) で切ると正六角形になる！
          this.cutAngleX = 45;
          this.cutAngleZ = -35.264;
          this.cutOffset = 0;
        }
        sound.playPop();
        const pct = Math.round(((this.cutOffset / 1.35) * 50) + 50);
        this.hooks.setSliderValue(Math.min(100, Math.max(0, pct)));
        this.rebuildCutterScene();
        this.renderCutterUI();
      });
    });
  }

  private bindSubmodeTabs(): void {
    document.getElementById('tab-craft')?.addEventListener('click', () => {
      if (this.submode !== 'craft') {
        this.submode = 'craft';
        this.initCraftMode(this.activeCraftType);
      }
    });
    document.getElementById('tab-revolve')?.addEventListener('click', () => {
      if (this.submode !== 'revolve') {
        this.submode = 'revolve';
        this.initRevolveMode(this.revolveIdx);
      }
    });
    document.getElementById('tab-cutter')?.addEventListener('click', () => {
      if (this.submode !== 'cutter') {
        this.submode = 'cutter';
        this.initCutterMode();
      }
    });
  }
}
