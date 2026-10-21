import * as THREE from 'three';
import { LabModeController, LabUIHooks } from './LabModeBase';
import { SceneManager } from '../core/SceneManager';
import { ANIMAL_STICKERS, PAINT_STAMPS, TextureFactory } from '../core/TextureFactory';
import { NetFoldingEngine, FaceCustomStyle } from '../engine/NetFoldingEngine';
import { VALID_CUBE_NETS, GridCoord } from '../engine/CubeNetsData';
import { sound } from '../core/SoundManager';
import { progressStore } from '../core/ProgressStore';
import { renderHanamaruSvg } from '../core/SvgIcons';

interface StamperStage {
  name: string;
  targetCells: GridCoord[];
  startCell: GridCoord;
}

const STAMPER_STAGES: StamperStage[] = [
  {
    name: 'ステージ1：十字の展開図をつくろう',
    targetCells: [
      { x: 2, z: 1 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
      { x: 2, z: 3 },
    ],
    startCell: { x: 2, z: 2 },
  },
  {
    name: 'ステージ2：T字の展開図をつくろう',
    targetCells: [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
      { x: 1, z: 3 },
    ],
    startCell: { x: 2, z: 2 },
  },
  {
    name: 'ステージ3：かいだん型の展開図をつくろう',
    targetCells: [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 3, z: 3 },
      { x: 4, z: 3 },
    ],
    startCell: { x: 2, z: 2 },
  },
];

export class Grade12Mode implements LabModeController {
  private submode: 'stamper' | 'sticker';
  private sceneManager!: SceneManager;
  private controlPanel!: HTMLElement;
  private hooks!: LabUIHooks;

  // Stamper 状態
  private stageIdx = 0;
  private boxGridPos: GridCoord = { x: 2, z: 2 };
  private boxMesh: THREE.Mesh | null = null;
  private rollPivot: THREE.Group | null = null;
  private floorGroup = new THREE.Group();
  // キューブの6方向の現在のスタンプIDインデックス: [Right(+X), Left(-X), Top(+Y), Bottom(-Y), Front(+Z), Back(-Z)]
  private cubeFaceStamps: number[] = [0, 1, 2, 3, 4, 5];
  private stampedMap = new Map<string, number>(); // "x,z" -> stampIdx
  private isRolling = false;
  private rollAnim: {
    axis: THREE.Vector3;
    targetAngle: number;
    currentAngle: number;
    nextPos: GridCoord;
    nextFaces: number[];
  } | null = null;
  private stamperFoldingEngine: NetFoldingEngine | null = null;
  private stamperCompleted = false;

  // Sticker クイズ状態
  private stickerNetIdx = 0;
  private stickerEngine: NetFoldingEngine | null = null;
  private faceStickerIndices: number[] = [0, 1, 2, 3, 4, 5];
  private questionTargetFace = 0;
  private correctOppositeFace = 0;
  private selectedAnswerSticker: number | null = null;
  private activeBrushSticker: number | null = null;
  private quizSolvedCount = 0;

  constructor(initialSubmode: 'stamper' | 'sticker' = 'stamper') {
    this.submode = initialSubmode;
  }

  public mount(sceneManager: SceneManager, controlPanel: HTMLElement, hooks: LabUIHooks): void {
    this.sceneManager = sceneManager;
    this.controlPanel = controlPanel;
    this.hooks = hooks;

    if (this.submode === 'stamper') {
      this.initStamperStage(0);
    } else {
      this.initStickerQuiz(0);
    }
  }

  public onSliderChange(percent: number): void {
    sound.playSliderTick(percent);
    if (this.submode === 'stamper') {
      if (this.stamperFoldingEngine) {
        if (this.boxMesh) this.boxMesh.visible = percent < 5;
        this.floorGroup.visible = false;
        this.stamperFoldingEngine.rootObject.visible = true;
        this.stamperFoldingEngine.setFoldProgress(percent);
      }
    } else if (this.stickerEngine) {
      this.stickerEngine.setFoldProgress(percent);
      if (percent >= 95) {
        this.hooks.setViewportBadge('箱が閉じたよ！反対側の面を回して見てみよう', 'ok');
      } else {
        this.hooks.setViewportBadge('スライダーで箱を組み立てて確かめられるよ', 'normal');
      }
    }
  }

  public onAssistToggle(enabled: boolean): void {
    if (this.stamperFoldingEngine) {
      this.stamperFoldingEngine.assistEnabled = enabled;
      this.stamperFoldingEngine.refreshCorrespondenceHighlights();
    }
    if (this.stickerEngine) {
      this.stickerEngine.assistEnabled = enabled;
      this.stickerEngine.refreshCorrespondenceHighlights();
    }
  }

  public dispose(): void {
    this.sceneManager.clearRoot();
  }

  // =========================================================
  // 1. はこころがし・スタンパー
  // =========================================================
  private initStamperStage(idx: number): void {
    this.stageIdx = idx % STAMPER_STAGES.length;
    const stage = STAMPER_STAGES[this.stageIdx];
    this.boxGridPos = { ...stage.startCell };
    this.cubeFaceStamps = [0, 1, 2, 3, 4, 5];
    this.stampedMap.clear();
    this.stamperCompleted = false;
    this.stamperFoldingEngine = null;
    this.isRolling = false;
    this.rollAnim = null;

    // 初期位置に底面スタンプを押す
    this.stampedMap.set(`${this.boxGridPos.x},${this.boxGridPos.z}`, this.cubeFaceStamps[3]);

    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.2, 6.2, 5.8], [0, 0.2, 0]);

    this.floorGroup = new THREE.Group();
    this.sceneManager.rootGroup.add(this.floorGroup);

    this.rebuildFloorMeshes();
    this.createStampBoxMesh();

    this.hooks.setSliderVisible(true, 'スタンプした展開図を組み立てる');
    this.hooks.setSliderValue(0);
    this.hooks.setViewportBadge('矢印ボタンかマス目をタップして箱を転がそう！', 'normal');

    // 3D上の床タイルタップで転がす
    this.sceneManager.onTap(intersect => {
      const data = intersect.object.userData;
      if (data && data.kind === 'floorCell') {
        const dx = data.gx - this.boxGridPos.x;
        const dz = data.gz - this.boxGridPos.z;
        if (Math.abs(dx) + Math.abs(dz) === 1) {
          this.rollBox(dx, dz);
        }
      } else if (this.stamperFoldingEngine) {
        this.stamperFoldingEngine.handleObjectTap(intersect.object);
      }
    });

    this.sceneManager.onFrame(dt => {
      this.updateRollAnimation(dt);
    });

    this.renderStamperUI();
  }

  private gridToWorld(gx: number, gz: number): { x: number; z: number } {
    return { x: gx - 2, z: gz - 2 };
  }

  private createStampBoxMesh(): void {
    if (this.rollPivot) {
      this.sceneManager.rootGroup.remove(this.rollPivot);
    }
    this.rollPivot = new THREE.Group();
    this.sceneManager.rootGroup.add(this.rollPivot);

    const geom = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const mats = this.cubeFaceStamps.map(sIdx => {
      const st = PAINT_STAMPS[sIdx];
      const tex = TextureFactory.createFaceTexture({
        fill: '#fdfdfa',
        border: '#1c2a4a',
        stampSymbol: st.symbol,
        stampColor: st.color,
        label: st.name,
      });
      return new THREE.MeshLambertMaterial({ map: tex });
    });

    this.boxMesh = new THREE.Mesh(geom, mats);
    const w = this.gridToWorld(this.boxGridPos.x, this.boxGridPos.z);
    this.rollPivot.position.set(w.x, 0, w.z);
    this.boxMesh.position.set(0, 0.5, 0);
    this.rollPivot.add(this.boxMesh);
  }

  private rebuildFloorMeshes(): void {
    this.floorGroup.clear();
    const stage = STAMPER_STAGES[this.stageIdx];
    const targetSet = new Set(stage.targetCells.map(c => `${c.x},${c.z}`));

    for (let gz = 0; gz < 5; gz++) {
      for (let gx = 0; gx < 5; gx++) {
        const key = `${gx},${gz}`;
        const isTarget = targetSet.has(key);
        const stampedIdx = this.stampedMap.get(key);
        const w = this.gridToWorld(gx, gz);

        const planeGeom = new THREE.PlaneGeometry(0.94, 0.94);
        planeGeom.rotateX(-Math.PI / 2);

        let mat: THREE.Material;
        if (stampedIdx !== undefined) {
          const st = PAINT_STAMPS[stampedIdx];
          const tex = TextureFactory.createFaceTexture({
            fill: isTarget ? '#fff5c2' : '#fdfdfa',
            border: isTarget ? '#1c2a4a' : '#6aa893',
            stampSymbol: st.symbol,
            stampColor: st.color,
          });
          mat = new THREE.MeshLambertMaterial({ map: tex });
        } else {
          mat = new THREE.MeshLambertMaterial({
            color: isTarget ? 0xd9efe4 : 0xfdfdfa,
            transparent: true,
            opacity: isTarget ? 0.92 : 0.45,
          });
        }

        const tile = new THREE.Mesh(planeGeom, mat);
        tile.position.set(w.x, 0.01, w.z);
        tile.userData = { kind: 'floorCell', gx, gz };
        this.floorGroup.add(tile);

        if (isTarget) {
          const edges = new THREE.EdgesGeometry(planeGeom);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: stampedIdx !== undefined ? 0x1c2a4a : 0x6aa893 })
          );
          line.position.set(w.x, 0.02, w.z);
          this.floorGroup.add(line);
        }
      }
    }
  }

  private rollBox(dx: number, dz: number): void {
    if (this.isRolling) return;
    const nx = this.boxGridPos.x + dx;
    const nz = this.boxGridPos.z + dz;
    if (nx < 0 || nx > 4 || nz < 0 || nz > 4) return;

    // 折りたたみプレビュー表示中なら床モードに戻す
    if (this.stamperFoldingEngine) {
      this.stamperFoldingEngine.rootObject.visible = false;
      this.floorGroup.visible = true;
      if (this.boxMesh) this.boxMesh.visible = true;
      this.hooks.setSliderValue(0);
    }

    // 回転後の6面インデックスを計算: [Right(+X:0), Left(-X:1), Top(+Y:2), Bottom(-Y:3), Front(+Z:4), Back(-Z:5)]
    const [R, L, T, B, F, K] = this.cubeFaceStamps;
    let nextFaces = [...this.cubeFaceStamps];
    let axis = new THREE.Vector3();

    if (dx === 1) {
      // 右(+X)へ転がる: Top->Right, Right->Bottom, Bottom->Left, Left->Top
      nextFaces = [T, B, L, R, F, K];
      axis.set(0, 0, -1);
    } else if (dx === -1) {
      // 左(-X)へ転がる
      nextFaces = [B, T, R, L, F, K];
      axis.set(0, 0, 1);
    } else if (dz === 1) {
      // 手前(+Z)へ転がる: Top->Front, Front->Bottom, Bottom->Back, Back->Top
      nextFaces = [R, L, K, F, T, B];
      axis.set(1, 0, 0);
    } else if (dz === -1) {
      // 奥(-Z)へ転がる
      nextFaces = [R, L, F, K, B, T];
      axis.set(-1, 0, 0);
    }

    // ロールピボットを回転辺に移動
    const w = this.gridToWorld(this.boxGridPos.x, this.boxGridPos.z);
    if (this.rollPivot && this.boxMesh) {
      this.rollPivot.position.set(w.x + dx * 0.5, 0, w.z + dz * 0.5);
      this.rollPivot.rotation.set(0, 0, 0);
      this.boxMesh.position.set(-dx * 0.5, 0.5, -dz * 0.5);
    }

    this.isRolling = true;
    this.rollAnim = {
      axis,
      targetAngle: Math.PI / 2,
      currentAngle: 0,
      nextPos: { x: nx, z: nz },
      nextFaces,
    };
  }

  private updateRollAnimation(dt: number): void {
    if (!this.isRolling || !this.rollAnim || !this.rollPivot) return;
    const speed = Math.PI * 3.4;
    this.rollAnim.currentAngle += speed * dt;

    if (this.rollAnim.currentAngle >= this.rollAnim.targetAngle) {
      // 回転完了
      this.isRolling = false;
      this.boxGridPos = { ...this.rollAnim.nextPos };
      this.cubeFaceStamps = [...this.rollAnim.nextFaces];
      this.rollAnim = null;

      // 床にスタンプを押す！
      this.stampedMap.set(`${this.boxGridPos.x},${this.boxGridPos.z}`, this.cubeFaceStamps[3]);
      sound.playPop();

      this.createStampBoxMesh();
      this.rebuildFloorMeshes();
      this.checkStamperCompletion();
      this.renderStamperUI();
    } else {
      this.rollPivot.setRotationFromAxisAngle(this.rollAnim.axis, this.rollAnim.currentAngle);
    }
  }

  private checkStamperCompletion(): void {
    const stage = STAMPER_STAGES[this.stageIdx];
    const allTargetStamped = stage.targetCells.every(c => this.stampedMap.has(`${c.x},${c.z}`));

    // 現在スタンプされているセルから折りたたみエンジンを更新構築
    const cells: GridCoord[] = [];
    const styles = new Map<number, FaceCustomStyle>();
    stage.targetCells.forEach((c, idx) => {
      const sIdx = this.stampedMap.get(`${c.x},${c.z}`);
      cells.push(c);
      if (sIdx !== undefined) {
        const st = PAINT_STAMPS[sIdx];
        styles.set(idx, {
          fill: '#fff5c2',
          stampSymbol: st.symbol,
          stampColor: st.color,
          label: st.name,
        });
      }
    });

    if (this.stamperFoldingEngine) {
      this.sceneManager.rootGroup.remove(this.stamperFoldingEngine.rootObject);
    }
    this.stamperFoldingEngine = new NetFoldingEngine(cells, 2, styles);
    this.stamperFoldingEngine.assistEnabled = this.hooks.getAssistEnabled();
    this.stamperFoldingEngine.rootObject.position.set(
      this.gridToWorld(cells[2].x, cells[2].z).x,
      0.03,
      this.gridToWorld(cells[2].x, cells[2].z).z
    );
    this.stamperFoldingEngine.rootObject.visible = false;
    this.sceneManager.rootGroup.add(this.stamperFoldingEngine.rootObject);

    if (allTargetStamped && !this.stamperCompleted) {
      this.stamperCompleted = true;
      sound.playCorrect();
      progressStore.setMaxScore('g12-stamper', this.stageIdx + 1);
      this.hooks.setViewportBadge('やったね！展開図のスタンプが完成したよ！スライダーで組み立てよう', 'ok');
    }
  }

  private renderStamperUI(): void {
    const stage = STAMPER_STAGES[this.stageIdx];
    const stampedTargetCount = stage.targetCells.filter(c => this.stampedMap.has(`${c.x},${c.z}`)).length;

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="1・2年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-stamper">🎨 はこころがし・スタンパー</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-sticker">🐶 さいころ動物シールあて</button>
      </div>
      <div class="meter-status">
        <span>スタンプ達成: <b class="meter-num">${stampedTargetCount} / ${stage.targetCells.length}</b> マス</span>
      </div>
    `);

    const bottomStamp = PAINT_STAMPS[this.cubeFaceStamps[3]];
    const topStamp = PAINT_STAMPS[this.cubeFaceStamps[2]];

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>${stage.name}</span>
          <span class="tile-badge">ステージ ${this.stageIdx + 1} / ${STAMPER_STAGES.length}</span>
        </div>
        <p class="sheet-desc">
          箱をパタンパタンと転がして、緑色のわくのマスすべてにスタンプを押そう！<br>
          いま下の面にあるのは <b style="color:${bottomStamp.color}">${bottomStamp.symbol} ${bottomStamp.name}</b>（上の面は <b style="color:${topStamp.color}">${topStamp.symbol} ${topStamp.name}</b>）だよ。
        </p>

        <div class="dpad" role="group" aria-label="箱を転がす方向ボタン">
          <div></div>
          <button type="button" class="dpad-btn" id="roll-up" aria-label="奥へ転がす">▲ おく</button>
          <div></div>
          <button type="button" class="dpad-btn" id="roll-left" aria-label="左へ転がす">◀ ひだり</button>
          <button type="button" class="dpad-btn" id="roll-down" aria-label="手前へ転がす">▼ 手前</button>
          <button type="button" class="dpad-btn" id="roll-right" aria-label="右へ転がす">みぎ ▶</button>
        </div>

        ${
          this.stamperCompleted
            ? `
          <div class="feedback-box">
            ${renderHanamaruSvg('hanamaru', true)}
            <div class="feedback-text">
              <div class="feedback-verdict">たいへんよくできました！</div>
              <div class="feedback-detail">すべてのマスにスタンプが押せたよ！下の「組み立てスライダー」を100%に動かして、床のスタンプが箱に戻る様子を見てみよう！</div>
            </div>
          </div>
          `
            : ''
        }

        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; justify-content:space-between; margin-top:0.25rem;">
          <button type="button" class="btn btn-sm" id="stamper-reset">やりなおす</button>
          <div style="display:flex; gap:0.4rem;">
            ${STAMPER_STAGES.map(
              (_, i) =>
                `<button type="button" class="btn btn-sm ${i === this.stageIdx ? 'btn-active' : ''}" data-stage="${i}">ステージ${i + 1}</button>`
            ).join('')}
          </div>
        </div>
      </div>
    `;

    this.bindSubmodeTabs();
    this.controlPanel.querySelector('#roll-up')?.addEventListener('click', () => this.rollBox(0, -1));
    this.controlPanel.querySelector('#roll-down')?.addEventListener('click', () => this.rollBox(0, 1));
    this.controlPanel.querySelector('#roll-left')?.addEventListener('click', () => this.rollBox(-1, 0));
    this.controlPanel.querySelector('#roll-right')?.addEventListener('click', () => this.rollBox(1, 0));
    this.controlPanel.querySelector('#stamper-reset')?.addEventListener('click', () => this.initStamperStage(this.stageIdx));
    this.controlPanel.querySelectorAll('[data-stage]').forEach(btn => {
      btn.addEventListener('click', e => {
        const s = Number((e.currentTarget as HTMLElement).dataset.stage);
        this.initStamperStage(s);
      });
    });
  }

  // =========================================================
  // 2. さいころ動物シールあて
  // =========================================================
  private initStickerQuiz(netIdx: number): void {
    this.stickerNetIdx = netIdx % VALID_CUBE_NETS.length;
    const net = VALID_CUBE_NETS[this.stickerNetIdx];
    this.faceStickerIndices = [0, 1, 2, 3, 4, 5];
    this.selectedAnswerSticker = null;

    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.2, 5.8, 5.5], [0, 0.3, 0]);

    const styles = this.buildStickerFaceStyles();
    this.stickerEngine = new NetFoldingEngine(net.cells, net.rootIndex, styles);
    this.stickerEngine.assistEnabled = this.hooks.getAssistEnabled();
    this.sceneManager.rootGroup.add(this.stickerEngine.rootObject);

    // 向かい合うペアから1組を出題
    const pairs = this.stickerEngine.analysis.oppositePairs;
    const chosenPair = pairs[this.stickerNetIdx % pairs.length] ?? [0, 5];
    this.questionTargetFace = chosenPair[0];
    this.correctOppositeFace = chosenPair[1];

    this.hooks.setSliderVisible(true, '組み立てスライダー（閉じて答えを確かめよう）');
    this.hooks.setSliderValue(0);
    this.hooks.setViewportBadge('面をタップするとシールを貼りかえられるよ！', 'normal');

    this.sceneManager.onTap(intersect => {
      if (!this.stickerEngine) return;
      const res = this.stickerEngine.handleObjectTap(intersect.object);
      if (res.type === 'face' && res.faceIndex !== undefined && this.activeBrushSticker !== null) {
        this.faceStickerIndices[res.faceIndex] = this.activeBrushSticker;
        const st = ANIMAL_STICKERS[this.activeBrushSticker];
        this.stickerEngine.updateFaceStyle(res.faceIndex, {
          fill: st.bg,
          emoji: st.emoji,
          label: st.name,
        });
        sound.playPop();
        this.renderStickerUI();
      }
    });

    this.renderStickerUI();
  }

  private buildStickerFaceStyles(): Map<number, FaceCustomStyle> {
    const map = new Map<number, FaceCustomStyle>();
    this.faceStickerIndices.forEach((sIdx, fIdx) => {
      const st = ANIMAL_STICKERS[sIdx % ANIMAL_STICKERS.length];
      map.set(fIdx, {
        fill: st.bg,
        emoji: st.emoji,
        label: st.name,
        subLabel: `${fIdx + 1}`,
      });
    });
    return map;
  }

  private renderStickerUI(): void {
    const targetSticker = ANIMAL_STICKERS[this.faceStickerIndices[this.questionTargetFace]];
    const correctSticker = ANIMAL_STICKERS[this.faceStickerIndices[this.correctOppositeFace]];

    // 4つの選択肢（正解の動物 + 他の3つの面にある動物）
    const candidateFaces = [0, 1, 2, 3, 4, 5].filter(f => f !== this.questionTargetFace);
    const optionFaces = [
      this.correctOppositeFace,
      ...candidateFaces.filter(f => f !== this.correctOppositeFace).slice(0, 3),
    ].sort((a, b) => a - b);

    const isAnswered = this.selectedAnswerSticker !== null;
    const isCorrect = this.selectedAnswerSticker === this.correctOppositeFace;

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="1・2年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-stamper">🎨 はこころがし・スタンパー</button>
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-sticker">🐶 さいころ動物シールあて</button>
      </div>
      <div class="meter-status">
        <span>正解数: <b class="meter-num">${this.quizSolvedCount}</b> 問</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>反対側の動物はだれかな？</span>
          <span class="tile-badge">もんだい ${this.stickerNetIdx + 1}</span>
        </div>
        <p class="sheet-desc">
          この展開図を組み立ててサイコロの箱にしたとき、<br>
          <b>「${targetSticker.emoji} ${targetSticker.name}（${this.questionTargetFace + 1}番の面）」の反対側（うらがわ）</b>にくる動物はだれかな？
        </p>

        <div class="options-grid">
          ${optionFaces
            .map(fIdx => {
              const st = ANIMAL_STICKERS[this.faceStickerIndices[fIdx]];
              let cls = 'option';
              if (isAnswered) {
                if (fIdx === this.correctOppositeFace) cls += ' correct';
                else if (fIdx === this.selectedAnswerSticker) cls += ' incorrect';
              }
              return `
                <button type="button" class="${cls}" data-ans-face="${fIdx}" ${isAnswered ? 'disabled' : ''}>
                  <span>${st.emoji} ${st.name}</span>
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
                isCorrect ? 'せいかい！花丸！' : `おしい！こたえは「${correctSticker.emoji} ${correctSticker.name}」だよ`
              }</div>
              <div class="feedback-detail">
                組み立てスライダーが 100% になったよ！3Dの箱をぐるっと回して、${targetSticker.emoji}の反対側に${correctSticker.emoji}がいるか確認してみよう。
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button type="button" class="btn btn-primary" id="next-sticker-q">つぎの問題へ ▶</button>
          </div>
          `
            : ''
        }
      </div>

      <div class="sheet-card">
        <div class="sheet-title">
          <span>好きな動物シールにはりかえよう</span>
        </div>
        <p class="sheet-note">下の動物をえらんでから、3Dの展開図の面をタップするとシールを貼りかえられるよ。</p>
        <div class="palette-row">
          <button type="button" class="palette-item ${this.activeBrushSticker === null ? 'is-selected' : ''}" data-brush="none">
            👆 見るだけ
          </button>
          ${ANIMAL_STICKERS.map(
            (st, idx) => `
              <button type="button" class="palette-item ${this.activeBrushSticker === idx ? 'is-selected' : ''}" data-brush="${idx}">
                ${st.emoji} ${st.name}
              </button>
            `
          ).join('')}
        </div>
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelectorAll('[data-ans-face]').forEach(btn => {
      btn.addEventListener('click', e => {
        const fIdx = Number((e.currentTarget as HTMLElement).dataset.ansFace);
        this.selectedAnswerSticker = fIdx;
        if (fIdx === this.correctOppositeFace) {
          this.quizSolvedCount++;
          sound.playCorrect();
          progressStore.addScore('g12-sticker', 1);
        } else {
          sound.playCollision();
        }
        // 自動的に100%組み立てて確認できるようにする
        this.hooks.setSliderValue(100);
        this.stickerEngine?.setFoldProgress(100, true);
        this.renderStickerUI();
      });
    });

    this.controlPanel.querySelector('#next-sticker-q')?.addEventListener('click', () => {
      this.initStickerQuiz(this.stickerNetIdx + 1);
    });

    this.controlPanel.querySelectorAll('[data-brush]').forEach(btn => {
      btn.addEventListener('click', e => {
        const val = (e.currentTarget as HTMLElement).dataset.brush;
        this.activeBrushSticker = val === 'none' ? null : Number(val);
        sound.playPop();
        this.renderStickerUI();
      });
    });
  }

  private bindSubmodeTabs(): void {
    document.getElementById('tab-stamper')?.addEventListener('click', () => {
      if (this.submode !== 'stamper') {
        this.submode = 'stamper';
        this.initStamperStage(this.stageIdx);
      }
    });
    document.getElementById('tab-sticker')?.addEventListener('click', () => {
      if (this.submode !== 'sticker') {
        this.submode = 'sticker';
        this.initStickerQuiz(this.stickerNetIdx);
      }
    });
  }
}
