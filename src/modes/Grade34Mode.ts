import { LabModeController, LabUIHooks } from './LabModeBase';
import { SceneManager } from '../core/SceneManager';
import {
  VALID_CUBE_NETS,
  INVALID_CUBE_NETS,
  CubeNetPattern,
  GridCoord,
  matchCubeNetPattern,
} from '../engine/CubeNetsData';
import { NetFoldingEngine, FaceCustomStyle } from '../engine/NetFoldingEngine';
import { sound } from '../core/SoundManager';
import { progressStore } from '../core/ProgressStore';
import { renderHanamaruSvg } from '../core/SvgIcons';

const CORNER_NAMES = ['左奥のカド', '右奥のカド', '右手前のカド', '左手前のカド'];

export class Grade34Mode implements LabModeController {
  private submode: 'judge' | 'notebook' | 'vertex';
  private sceneManager!: SceneManager;
  private controlPanel!: HTMLElement;
  private hooks!: LabUIHooks;

  private engine: NetFoldingEngine | null = null;

  // 1. 組み立て判定ゲーム用状態
  private judgeDeck: CubeNetPattern[] = [];
  private judgeIdx = 0;
  private judgeAnswered: boolean | null = null; // ユーザーの回答 (true=できる, false=できない)
  private judgeScore = 0;

  // 2. 11パターン収集手帳用状態
  private editorCells: GridCoord[] = [
    { x: 2, z: 1 },
    { x: 1, z: 2 },
    { x: 2, z: 2 },
    { x: 3, z: 2 },
    { x: 4, z: 2 },
    { x: 2, z: 3 },
  ];
  private lastMatchedNet: CubeNetPattern | null = null;
  private newlyDiscoveredBanner: string | null = null;

  // 3. 頂点マッチング用状態
  private vertexQuizIdx = 0;
  private targetVertex: { faceIndex: number; cornerIndex: number } = { faceIndex: 0, cornerIndex: 0 };
  private correctPartnerVertices: { faceIndex: number; cornerIndex: number }[] = [];
  private selectedPartner: { faceIndex: number; cornerIndex: number } | null = null;
  private vertexOptions: { faceIndex: number; cornerIndex: number; isCorrect: boolean }[] = [];
  private vertexScore = 0;

  constructor(initialSubmode: 'judge' | 'notebook' | 'vertex' = 'judge') {
    this.submode = initialSubmode;
    this.buildJudgeDeck();
  }

  private buildJudgeDeck(): void {
    // 正しい展開図と失敗展開図を交互にバランスよく混ぜる
    this.judgeDeck = [
      VALID_CUBE_NETS[0],
      INVALID_CUBE_NETS[0],
      VALID_CUBE_NETS[6],
      INVALID_CUBE_NETS[1],
      VALID_CUBE_NETS[9],
      INVALID_CUBE_NETS[2],
      VALID_CUBE_NETS[4],
      INVALID_CUBE_NETS[3],
      VALID_CUBE_NETS[10],
      INVALID_CUBE_NETS[4],
      VALID_CUBE_NETS[2],
      INVALID_CUBE_NETS[5],
    ];
  }

  public mount(sceneManager: SceneManager, controlPanel: HTMLElement, hooks: LabUIHooks): void {
    this.sceneManager = sceneManager;
    this.controlPanel = controlPanel;
    this.hooks = hooks;

    this.sceneManager.onFrame(dt => {
      this.engine?.updateFrame(dt);
    });

    if (this.submode === 'judge') {
      this.initJudgeQuestion(this.judgeIdx);
    } else if (this.submode === 'notebook') {
      this.initNotebookMode();
    } else {
      this.initVertexQuestion(this.vertexQuizIdx);
    }
  }

  public onSliderChange(percent: number): void {
    sound.playSliderTick(percent);
    if (!this.engine) return;
    const res = this.engine.setFoldProgress(percent);
    if (res.isColliding) {
      this.hooks.setViewportBadge('ガチン！面と面がぶつかって重なってしまったよ！（赤い点線は空いた穴）', 'alert');
    } else if (res.isComplete) {
      this.hooks.setViewportBadge('ピタッ！きれいな立方体が完成したよ！', 'ok');
    } else {
      this.hooks.setViewportBadge('面をタップすると対応する辺や面が光るよ', 'normal');
    }
  }

  public onAssistToggle(enabled: boolean): void {
    if (this.engine) {
      this.engine.assistEnabled = enabled;
      this.engine.refreshCorrespondenceHighlights();
    }
  }

  public dispose(): void {
    this.sceneManager.clearRoot();
  }

  // =========================================================
  // 1. 組み立て判定ゲーム（できる？できない？）
  // =========================================================
  private initJudgeQuestion(idx: number): void {
    this.judgeIdx = idx % this.judgeDeck.length;
    this.judgeAnswered = null;
    const pat = this.judgeDeck[this.judgeIdx];

    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.4, 5.8, 5.6], [0, 0.3, 0]);

    const styles = new Map<number, FaceCustomStyle>();
    pat.cells.forEach((_, i) => {
      styles.set(i, {
        label: `${i + 1}`,
        subLabel: i === pat.rootIndex ? '底面' : `面${i + 1}`,
        fill: i === pat.rootIndex ? '#fff5c2' : '#fdfdfa',
      });
    });

    this.engine = new NetFoldingEngine(pat.cells, pat.rootIndex, styles);
    this.engine.assistEnabled = this.hooks.getAssistEnabled();
    this.sceneManager.rootGroup.add(this.engine.rootObject);

    this.hooks.setSliderVisible(true, '組み立てスライダー（動かして確かめよう）');
    this.hooks.setSliderValue(0);
    this.hooks.setViewportBadge('まずは頭の中で折りたたんで予想してみよう！', 'normal');

    this.sceneManager.onTap(intersect => {
      this.engine?.handleObjectTap(intersect.object);
    });

    this.renderJudgeUI();
  }

  private renderJudgeUI(): void {
    const pat = this.judgeDeck[this.judgeIdx];
    const isAnswered = this.judgeAnswered !== null;
    const isUserCorrect = this.judgeAnswered === pat.isValid;

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="3・4年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-judge">⚖️ 組み立て判定</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-notebook">📖 11パターン手帳</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-vertex">📍 頂点マッチング</button>
      </div>
      <div class="meter-status">
        <span>正解数: <b class="meter-num">${this.judgeScore}</b> 問</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>この展開図は立方体になる？</span>
          <span class="tile-badge">第 ${this.judgeIdx + 1} 問</span>
        </div>
        <p class="sheet-desc">
          黄色い「底面」を基準にして90°ずつ折り曲げたとき、面が重ならずに<b>ちゃんとした立方体になる</b>かな？
        </p>

        <div class="options-grid">
          <button type="button" class="option ${
            isAnswered ? (pat.isValid ? 'correct' : this.judgeAnswered === true ? 'incorrect' : '') : ''
          }" id="ans-valid" ${isAnswered ? 'disabled' : ''}>
            ⭕ 立方体になる
          </button>
          <button type="button" class="option ${
            isAnswered ? (!pat.isValid ? 'correct' : this.judgeAnswered === false ? 'incorrect' : '') : ''
          }" id="ans-invalid" ${isAnswered ? 'disabled' : ''}>
            ❌ 重なって失敗する
          </button>
        </div>

        ${
          isAnswered
            ? `
          <div class="feedback-box ${isUserCorrect ? '' : 'is-ng'}">
            ${isUserCorrect ? renderHanamaruSvg('hanamaru', true) : ''}
            <div class="feedback-text">
              <div class="feedback-verdict">
                ${isUserCorrect ? '大せいかい！そのとおり！' : 'おしい！スライダーで動きを見てみよう'}
              </div>
              <div class="feedback-detail">
                <b>【${pat.name}】</b><br>
                ${pat.hint}
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <button type="button" class="btn btn-sm" id="replay-fold">🔄 0%からもう一度おりたたむ</button>
            <button type="button" class="btn btn-primary" id="next-judge-q">つぎの問題へ ▶</button>
          </div>
          `
            : `<p class="sheet-note">💡 ヒント：答える前でも、下の「組み立てスライダー」を少しずつ動かして考えてもいいよ！</p>`
        }
      </div>
    `;

    this.bindSubmodeTabs();

    const handleJudge = (guess: boolean) => {
      this.judgeAnswered = guess;
      if (guess === pat.isValid) {
        this.judgeScore++;
        sound.playCorrect();
        progressStore.addScore('g34-judge', 1);
      } else {
        sound.playCollision();
      }
      // スライダーを100%へ進めて結果を見せる
      this.hooks.setSliderValue(100);
      this.onSliderChange(100);
      this.renderJudgeUI();
    };

    this.controlPanel.querySelector('#ans-valid')?.addEventListener('click', () => handleJudge(true));
    this.controlPanel.querySelector('#ans-invalid')?.addEventListener('click', () => handleJudge(false));
    this.controlPanel.querySelector('#replay-fold')?.addEventListener('click', () => {
      this.hooks.setSliderValue(0);
      this.onSliderChange(0);
    });
    this.controlPanel.querySelector('#next-judge-q')?.addEventListener('click', () => {
      this.initJudgeQuestion(this.judgeIdx + 1);
    });
  }

  // =========================================================
  // 2. 11パターン収集手帳（展開図ずかん）
  // =========================================================
  private initNotebookMode(): void {
    this.newlyDiscoveredBanner = null;
    this.rebuildNotebook3D();
    this.renderNotebookUI();
  }

  private getBestRootIndex(cells: GridCoord[]): number {
    if (cells.length === 0) return 0;
    const avgX = cells.reduce((s, c) => s + c.x, 0) / cells.length;
    const avgZ = cells.reduce((s, c) => s + c.z, 0) / cells.length;
    let bestIdx = 0;
    let bestScore = -Infinity;
    cells.forEach((c, idx) => {
      const neighbors = cells.filter(
        o => Math.abs(o.x - c.x) + Math.abs(o.z - c.z) === 1
      ).length;
      const dist = Math.hypot(c.x - avgX, c.z - avgZ);
      const score = neighbors * 10 - dist;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  private rebuildNotebook3D(): void {
    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.4, 5.8, 5.6], [0, 0.3, 0]);

    const rootIdx = this.getBestRootIndex(this.editorCells);
    const styles = new Map<number, FaceCustomStyle>();
    this.editorCells.forEach((_, i) => {
      styles.set(i, {
        label: `${i + 1}`,
        fill: i === rootIdx ? '#fff5c2' : '#fdfdfa',
      });
    });

    this.engine = new NetFoldingEngine(this.editorCells, rootIdx, styles);
    this.engine.assistEnabled = this.hooks.getAssistEnabled();
    this.sceneManager.rootGroup.add(this.engine.rootObject);

    this.lastMatchedNet = matchCubeNetPattern(this.editorCells);
    if (this.lastMatchedNet) {
      const isNew = progressStore.markNetFound(this.lastMatchedNet.id);
      const foundTotal = progressStore.getFoundNetsCount();
      progressStore.setMaxScore('g34-notebook', foundTotal);
      if (isNew) {
        sound.playCorrect();
        this.newlyDiscoveredBanner = `🎉 新発見！「No.${this.lastMatchedNet.index} ${this.lastMatchedNet.name}」を手帳に登録したよ！`;
      } else {
        this.newlyDiscoveredBanner = null;
      }
      this.hooks.setViewportBadge(
        `⭕ 正しい展開図！「No.${this.lastMatchedNet.index} ${this.lastMatchedNet.name}」`,
        'ok'
      );
    } else if (this.editorCells.length === 6) {
      if (!this.engine.analysis.isConnected) {
        this.hooks.setViewportBadge('⚠️ 面が離れているよ。6つの面を辺でつなげよう', 'alert');
      } else {
        this.hooks.setViewportBadge('❌ 6マスあるけれど、折りたたむと重なってしまう形だよ', 'alert');
      }
    } else {
      this.hooks.setViewportBadge(
        `現在 ${this.editorCells.length} マス（あと ${Math.max(0, 6 - this.editorCells.length)} マス選ぼう）`,
        'normal'
      );
    }

    this.hooks.setSliderVisible(true, '組み立てスライダー（作った展開図を折りたたむ）');
    this.hooks.setSliderValue(0);

    this.sceneManager.onTap(intersect => {
      this.engine?.handleObjectTap(intersect.object);
    });
  }

  private renderNotebookUI(): void {
    const foundCount = progressStore.getFoundNetsCount();
    const cellSet = new Set(this.editorCells.map(c => `${c.x},${c.z}`));
    const rootIdx = this.getBestRootIndex(this.editorCells);

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="3・4年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-judge">⚖️ 組み立て判定</button>
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-notebook">📖 11パターン手帳</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-vertex">📍 頂点マッチング</button>
      </div>
      <div class="meter-status">
        <span>図鑑コンプリート: <b class="meter-num">${foundCount} / 11</b> 種類</span>
      </div>
    `);

    const gridButtonsHtml: string[] = [];
    for (let gz = 0; gz < 5; gz++) {
      for (let gx = 0; gx < 5; gx++) {
        const key = `${gx},${gz}`;
        const idx = this.editorCells.findIndex(c => c.x === gx && c.z === gz);
        const isOn = cellSet.has(key);
        gridButtonsHtml.push(`
          <button type="button" class="net-cell ${isOn ? (idx === rootIdx ? 'is-root' : 'is-active') : ''}" data-gx="${gx}" data-gz="${gz}">
            ${isOn ? idx + 1 : ''}
            ${idx === rootIdx ? '<span class="net-cell-sub">底</span>' : ''}
          </button>
        `);
      }
    }

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>5×5 マスをポチポチ押して探そう</span>
          <span class="tile-badge">${this.editorCells.length} / 6 マス</span>
        </div>
        <p class="sheet-note">
          6つの正方形をつなげて、全11種類の展開図を見つけよう！（回転や裏返しで同じになる形は同じ番号になるよ）
        </p>

        ${
          this.newlyDiscoveredBanner
            ? `
          <div class="feedback-box">
            ${renderHanamaruSvg('hanamaru', true)}
            <div class="feedback-text">
              <div class="feedback-verdict">${this.newlyDiscoveredBanner}</div>
              <div class="feedback-detail">${this.lastMatchedNet?.hint ?? ''}</div>
            </div>
          </div>
          `
            : ''
        }

        <div class="net-grid-wrap">
          <div class="net-grid" style="grid-template-columns: repeat(5, 1fr);">
            ${gridButtonsHtml.join('')}
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
            <button type="button" class="btn btn-sm" id="nb-clear">すべて消す</button>
            <button type="button" class="btn btn-sm" id="nb-hint">💡 まだ見つけていない形のヒント</button>
            <button type="button" class="btn btn-sm btn-primary" id="nb-fold">📦 100%組み立ててみる</button>
          </div>
        </div>
      </div>

      <div class="sheet-card">
        <div class="sheet-title">
          <span>立方体の展開図ずかん（全11種類）</span>
          <span class="tile-badge">${foundCount} / 11 発見</span>
        </div>
        <p class="sheet-note">見つけたカードをタップすると、その展開図を3Dで呼び出せるよ。</p>
        <div class="notebook-grid">
          ${VALID_CUBE_NETS.map(pat => {
            const isFound = progressStore.isNetFound(pat.id);
            const miniCells: string[] = [];
            const pSet = new Set(pat.cells.map(c => `${c.x},${c.z}`));
            for (let z = 0; z < 5; z++) {
              for (let x = 0; x < 5; x++) {
                miniCells.push(
                  `<span class="notebook-mini-cell ${pSet.has(`${x},${z}`) ? 'on' : ''}"></span>`
                );
              }
            }
            return `
              <button type="button" class="notebook-card ${isFound ? 'is-found' : ''}" data-load-net="${pat.id}">
                <div class="notebook-mini-grid">${miniCells.join('')}</div>
                <div class="notebook-card-name">
                  No.${pat.index}<br>${isFound ? pat.name : '？？？'}
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelectorAll('.net-cell').forEach(btn => {
      btn.addEventListener('click', e => {
        const el = e.currentTarget as HTMLElement;
        const gx = Number(el.dataset.gx);
        const gz = Number(el.dataset.gz);
        const existingIdx = this.editorCells.findIndex(c => c.x === gx && c.z === gz);
        if (existingIdx >= 0) {
          this.editorCells.splice(existingIdx, 1);
          sound.playPop();
        } else if (this.editorCells.length < 6) {
          this.editorCells.push({ x: gx, z: gz });
          sound.playPop();
        } else {
          sound.playCollision();
          this.hooks.setViewportBadge('6マスまで置けるよ！いらないマスをタップして消してね', 'alert');
          return;
        }
        this.rebuildNotebook3D();
        this.renderNotebookUI();
      });
    });

    this.controlPanel.querySelector('#nb-clear')?.addEventListener('click', () => {
      this.editorCells = [{ x: 2, z: 2 }];
      sound.playPop();
      this.rebuildNotebook3D();
      this.renderNotebookUI();
    });

    this.controlPanel.querySelector('#nb-fold')?.addEventListener('click', () => {
      this.hooks.setSliderValue(100);
      this.onSliderChange(100);
    });

    this.controlPanel.querySelector('#nb-hint')?.addEventListener('click', () => {
      const missing = VALID_CUBE_NETS.find(p => !progressStore.isNetFound(p.id)) ?? VALID_CUBE_NETS[0];
      // 最後の1マスだけ外した5マス状態をセットしてヒントにする
      this.editorCells = missing.cells.slice(0, 5).map(c => ({ x: c.x, z: c.z + 1 }));
      sound.playPop();
      this.rebuildNotebook3D();
      this.hooks.setViewportBadge(
        `ヒント：【${missing.group}】あと1マスどこかに足すと「No.${missing.index}」になるよ！`,
        'normal'
      );
      this.renderNotebookUI();
    });

    this.controlPanel.querySelectorAll('[data-load-net]').forEach(btn => {
      btn.addEventListener('click', e => {
        const netId = (e.currentTarget as HTMLElement).dataset.loadNet;
        const pat = VALID_CUBE_NETS.find(p => p.id === netId);
        if (!pat) return;
        if (!progressStore.isNetFound(pat.id)) {
          this.hooks.setViewportBadge(`No.${pat.index} は【${pat.group}】だよ。パズルで作ってみよう！`, 'normal');
          return;
        }
        this.editorCells = pat.cells.map(c => ({ x: c.x, z: c.z + 1 }));
        sound.playPop();
        this.rebuildNotebook3D();
        this.renderNotebookUI();
      });
    });
  }

  // =========================================================
  // 3. 頂点・辺マッチング
  // =========================================================
  private initVertexQuestion(idx: number): void {
    this.vertexQuizIdx = idx % VALID_CUBE_NETS.length;
    const net = VALID_CUBE_NETS[this.vertexQuizIdx];
    this.selectedPartner = null;

    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.2, 6.2, 5.4], [0, 0.2, 0]);

    const styles = new Map<number, FaceCustomStyle>();
    net.cells.forEach((_, i) => {
      styles.set(i, {
        label: `面${i + 1}`,
        subLabel: i === net.rootIndex ? '底' : `${i + 1}`,
        fill: i === net.rootIndex ? '#fff5c2' : '#fdfdfa',
      });
    });

    this.engine = new NetFoldingEngine(net.cells, net.rootIndex, styles, {
      showInteractivePoints: true,
    });
    this.engine.assistEnabled = false;
    this.sceneManager.rootGroup.add(this.engine.rootObject);

    // 平面上で離れた場所にあるが、組み立てると同じ頂点に集まるグループを選ぶ
    const multiGroups = this.engine.analysis.vertexGroups.filter(g => {
      if (g.members.length < 2) return false;
      // 展開図上で最初からくっついていないペアを探す
      const m0 = g.members[0];
      return g.members.some(
        m => Math.hypot(m.flatPos.x - m0.flatPos.x, m.flatPos.z - m0.flatPos.z) > 0.25
      );
    });

    const chosenGroup = multiGroups[this.vertexQuizIdx % multiGroups.length] ?? this.engine.analysis.vertexGroups[0];
    const baseMember = chosenGroup.members[0];
    this.targetVertex = { faceIndex: baseMember.faceIndex, cornerIndex: baseMember.cornerIndex };

    // 平面上で離れた位置にあって組み立てると重なるパートナー頂点
    this.correctPartnerVertices = chosenGroup.members
      .slice(1)
      .filter(
        m =>
          Math.hypot(m.flatPos.x - baseMember.flatPos.x, m.flatPos.z - baseMember.flatPos.z) > 0.25
      )
      .map(m => ({ faceIndex: m.faceIndex, cornerIndex: m.cornerIndex }));

    if (this.correctPartnerVertices.length === 0 && chosenGroup.members.length > 1) {
      this.correctPartnerVertices = [
        {
          faceIndex: chosenGroup.members[1].faceIndex,
          cornerIndex: chosenGroup.members[1].cornerIndex,
        },
      ];
    }

    const primaryCorrect = this.correctPartnerVertices[0];

    // ダミー選択肢を3つ選ぶ
    const distractors: { faceIndex: number; cornerIndex: number; isCorrect: boolean }[] = [];
    for (const g of this.engine.analysis.vertexGroups) {
      if (g === chosenGroup) continue;
      for (const m of g.members) {
        if (m.faceIndex !== this.targetVertex.faceIndex && distractors.length < 3) {
          distractors.push({ faceIndex: m.faceIndex, cornerIndex: m.cornerIndex, isCorrect: false });
          break;
        }
      }
    }

    this.vertexOptions = [
      { ...primaryCorrect, isCorrect: true },
      ...distractors,
    ].sort((a, b) => (a.faceIndex !== b.faceIndex ? a.faceIndex - b.faceIndex : a.cornerIndex - b.cornerIndex));

    this.engine.highlightSpecificVertex(this.targetVertex, []);

    this.hooks.setSliderVisible(true, '組み立てスライダー（動かして頂点が重なるか見よう）');
    this.hooks.setSliderValue(0);
    this.hooks.setViewportBadge('赤く光る「点A」と重なるカドの玉をタップしよう！', 'normal');

    this.sceneManager.onTap(intersect => {
      const data = intersect.object.userData;
      if (data && data.kind === 'vertex' && this.selectedPartner === null) {
        const fIdx = data.faceIndex as number;
        const cIdx = data.cornerIndex as number;
        if (fIdx === this.targetVertex.faceIndex && cIdx === this.targetVertex.cornerIndex) return;
        this.submitVertexAnswer({ faceIndex: fIdx, cornerIndex: cIdx });
      }
    });

    this.renderVertexUI();
  }

  private submitVertexAnswer(choice: { faceIndex: number; cornerIndex: number }): void {
    this.selectedPartner = choice;
    const isCorrect = this.correctPartnerVertices.some(
      v => v.faceIndex === choice.faceIndex && v.cornerIndex === choice.cornerIndex
    );
    if (isCorrect) {
      this.vertexScore++;
      sound.playCorrect();
      progressStore.addScore('g34-vertex', 1);
    } else {
      sound.playCollision();
    }

    this.engine?.highlightSpecificVertex(this.targetVertex, [choice, ...this.correctPartnerVertices]);
    this.hooks.setSliderValue(100);
    this.engine?.setFoldProgress(100, true);
    this.renderVertexUI();
  }

  private renderVertexUI(): void {
    const isAnswered = this.selectedPartner !== null;
    const isCorrect =
      this.selectedPartner !== null &&
      this.correctPartnerVertices.some(
        v =>
          v.faceIndex === this.selectedPartner!.faceIndex &&
          v.cornerIndex === this.selectedPartner!.cornerIndex
      );

    const correctLabel = this.correctPartnerVertices
      .map(v => `「面${v.faceIndex + 1} の ${CORNER_NAMES[v.cornerIndex]}」`)
      .join(' または ');

    this.hooks.setMeterContent(`
      <div class="submode-tabs" role="group" aria-label="3・4年生モード切替">
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-judge">⚖️ 組み立て判定</button>
        <button type="button" class="submode-tab" aria-pressed="false" id="tab-notebook">📖 11パターン手帳</button>
        <button type="button" class="submode-tab" aria-pressed="true" id="tab-vertex">📍 頂点マッチング</button>
      </div>
      <div class="meter-status">
        <span>正解数: <b class="meter-num">${this.vertexScore}</b> 問</span>
      </div>
    `);

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>重なる頂点（カド）はどこ？</span>
          <span class="tile-badge">第 ${this.vertexQuizIdx + 1} 問</span>
        </div>
        <p class="sheet-desc">
          展開図を組み立てたとき、赤く光っている<br>
          <b style="color:var(--red);">🔴 点A（面${this.targetVertex.faceIndex + 1} の ${CORNER_NAMES[this.targetVertex.cornerIndex]}）</b><br>
          とピタッと重なる頂点を、3D画面の玉をタップするか下のボタンから選ぼう！
        </p>

        <div class="options-grid">
          ${this.vertexOptions
            .map((opt, i) => {
              const isThisSelected =
                this.selectedPartner?.faceIndex === opt.faceIndex &&
                this.selectedPartner?.cornerIndex === opt.cornerIndex;
              let cls = 'option';
              if (isAnswered) {
                if (opt.isCorrect) cls += ' correct';
                else if (isThisSelected) cls += ' incorrect';
              }
              return `
                <button type="button" class="${cls}" data-vopt="${i}" ${isAnswered ? 'disabled' : ''} style="font-size:1.05rem;">
                  面${opt.faceIndex + 1} の ${CORNER_NAMES[opt.cornerIndex]}
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
                isCorrect ? 'せいかい！ピタッと重なったね！' : 'おしい！スライダーを往復させて重なる動きを見てみよう'
              }</div>
              <div class="feedback-detail">
                点Aと重なる頂点は <b>${correctLabel}</b> だよ。スライダーを0%〜100%に動かすと、赤い玉と黄色い玉が出会う様子がよくわかるよ！
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button type="button" class="btn btn-primary" id="next-vertex-q">つぎの問題へ ▶</button>
          </div>
          `
            : ''
        }
      </div>
    `;

    this.bindSubmodeTabs();

    this.controlPanel.querySelectorAll('[data-vopt]').forEach(btn => {
      btn.addEventListener('click', e => {
        const i = Number((e.currentTarget as HTMLElement).dataset.vopt);
        const opt = this.vertexOptions[i];
        if (opt) {
          this.submitVertexAnswer({ faceIndex: opt.faceIndex, cornerIndex: opt.cornerIndex });
        }
      });
    });

    this.controlPanel.querySelector('#next-vertex-q')?.addEventListener('click', () => {
      this.initVertexQuestion(this.vertexQuizIdx + 1);
    });
  }

  private bindSubmodeTabs(): void {
    document.getElementById('tab-judge')?.addEventListener('click', () => {
      if (this.submode !== 'judge') {
        this.submode = 'judge';
        this.initJudgeQuestion(this.judgeIdx);
      }
    });
    document.getElementById('tab-notebook')?.addEventListener('click', () => {
      if (this.submode !== 'notebook') {
        this.submode = 'notebook';
        this.initNotebookMode();
      }
    });
    document.getElementById('tab-vertex')?.addEventListener('click', () => {
      if (this.submode !== 'vertex') {
        this.submode = 'vertex';
        this.initVertexQuestion(this.vertexQuizIdx);
      }
    });
  }
}
