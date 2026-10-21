import { LabModeController, LabUIHooks } from './LabModeBase';
import { SceneManager } from '../core/SceneManager';
import { GridCoord, VALID_CUBE_NETS, matchCubeNetPattern } from '../engine/CubeNetsData';
import { NetFoldingEngine, FaceCustomStyle } from '../engine/NetFoldingEngine';
import { ANIMAL_STICKERS, PAINT_STAMPS } from '../core/TextureFactory';
import { sound } from '../core/SoundManager';
import { progressStore } from '../core/ProgressStore';

interface BrushTool {
  kind: 'color' | 'animal' | 'dice' | 'stamp';
  value: string | number;
  label: string;
}

export class SandboxMode implements LabModeController {
  private sceneManager!: SceneManager;
  private controlPanel!: HTMLElement;
  private hooks!: LabUIHooks;

  private cells: GridCoord[] = [
    { x: 2, z: 1 },
    { x: 1, z: 2 },
    { x: 2, z: 2 },
    { x: 3, z: 2 },
    { x: 4, z: 2 },
    { x: 2, z: 3 },
  ];
  private rootIdx = 2;
  private cellStyles = new Map<string, FaceCustomStyle>();
  private foldAngleDeg = 90;
  private activeBrush: BrushTool = { kind: 'color', value: '#fff5c2', label: 'きいろマーカー' };
  private engine: NetFoldingEngine | null = null;

  public mount(sceneManager: SceneManager, controlPanel: HTMLElement, hooks: LabUIHooks): void {
    this.sceneManager = sceneManager;
    this.controlPanel = controlPanel;
    this.hooks = hooks;

    this.sceneManager.onFrame(dt => {
      this.engine?.updateFrame(dt);
    });

    this.rebuildSandbox3D();
    this.renderSandboxUI();
  }

  public onSliderChange(percent: number): void {
    sound.playSliderTick(percent);
    if (!this.engine) return;
    const res = this.engine.setFoldProgress(percent);
    if (res.isColliding) {
      this.hooks.setViewportBadge('ガチン！重なってぶつかる面があるよ（赤く光っている面）', 'alert');
    } else if (res.isComplete) {
      progressStore.setMaxScore('sandbox', 1);
      this.hooks.setViewportBadge('ピタッ！オリジナル立方体が完成したよ！', 'ok');
    } else if (percent >= 95 && this.cells.length === 5 && this.engine.analysis.collidingFacePairs.length === 0) {
      progressStore.setMaxScore('sandbox', 1);
      this.hooks.setViewportBadge('上あきの「フタなし箱」が完成したよ！', 'ok');
    } else {
      this.hooks.setViewportBadge('3Dの面をタップすると、選択中のシールや色をぬれるよ！', 'normal');
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

  private rebuildSandbox3D(): void {
    this.sceneManager.clearRoot();
    this.sceneManager.resetCamera([4.5, 5.8, 5.8], [0, 0.3, 0]);

    this.rootIdx = this.getBestRootIndex(this.cells);

    const indexStyles = new Map<number, FaceCustomStyle>();
    this.cells.forEach((c, idx) => {
      const saved = this.cellStyles.get(`${c.x},${c.z}`);
      indexStyles.set(idx, {
        fill: saved?.fill ?? (idx === this.rootIdx ? '#fff5c2' : '#fdfdfa'),
        label: saved?.label ?? `${idx + 1}`,
        subLabel: idx === this.rootIdx ? '底面' : `${idx + 1}`,
        emoji: saved?.emoji,
        diceValue: saved?.diceValue,
        stampSymbol: saved?.stampSymbol,
        stampColor: saved?.stampColor,
      });
    });

    const rad = (this.foldAngleDeg * Math.PI) / 180;
    this.engine = new NetFoldingEngine(this.cells, this.rootIdx, indexStyles, {
      customFoldAngle: rad,
    });
    this.engine.assistEnabled = this.hooks.getAssistEnabled();
    this.sceneManager.rootGroup.add(this.engine.rootObject);

    this.hooks.setSliderVisible(true, '組み立てスライダー（オリジナル展開図を組み立てる）');
    this.hooks.setSliderValue(0);

    const matched = matchCubeNetPattern(this.cells);
    if (matched) {
      this.hooks.setViewportBadge(`立方体の展開図「No.${matched.index} ${matched.name}」になっているよ！`, 'ok');
    } else {
      this.hooks.setViewportBadge('方眼マスをタップして面を置いたり、3Dの面にシールを貼ろう！', 'normal');
    }

    this.sceneManager.onTap(intersect => {
      if (!this.engine) return;
      const res = this.engine.handleObjectTap(intersect.object);
      if (res.type === 'face' && res.faceIndex !== undefined) {
        this.applyBrushToFace(res.faceIndex);
      }
    });
  }

  private applyBrushToFace(faceIndex: number): void {
    const c = this.cells[faceIndex];
    if (!c || !this.engine) return;
    const key = `${c.x},${c.z}`;
    const prev = this.cellStyles.get(key) ?? {};
    let next: FaceCustomStyle = { ...prev };

    if (this.activeBrush.kind === 'color') {
      next = {
        fill: String(this.activeBrush.value),
        label: `${faceIndex + 1}`,
      };
    } else if (this.activeBrush.kind === 'animal') {
      const st = ANIMAL_STICKERS[Number(this.activeBrush.value)];
      next = {
        fill: st.bg,
        emoji: st.emoji,
        label: st.name,
      };
    } else if (this.activeBrush.kind === 'dice') {
      const v = Number(this.activeBrush.value);
      next = {
        fill: '#fdfdfa',
        diceValue: v,
        label: '',
      };
    } else if (this.activeBrush.kind === 'stamp') {
      const st = PAINT_STAMPS[Number(this.activeBrush.value)];
      next = {
        fill: '#fdfdfa',
        stampSymbol: st.symbol,
        stampColor: st.color,
        label: st.name,
      };
    }

    this.cellStyles.set(key, next);
    this.engine.updateFaceStyle(faceIndex, next);
    sound.playPop();
  }

  private renderSandboxUI(): void {
    const cellSet = new Set(this.cells.map(c => `${c.x},${c.z}`));
    const matched = matchCubeNetPattern(this.cells);

    this.hooks.setMeterContent(`
      <div class="submode-tabs">
        <span style="font-weight:700; font-size:0.9rem;">🛠️ じゆうさくせい（サンドボックス）</span>
      </div>
      <div class="meter-status">
        <span>配置した面: <b class="meter-num">${this.cells.length}</b> 枚</span>
      </div>
    `);

    const gridCellsHtml: string[] = [];
    for (let gz = 0; gz < 6; gz++) {
      for (let gx = 0; gx < 6; gx++) {
        const key = `${gx},${gz}`;
        const idx = this.cells.findIndex(c => c.x === gx && c.z === gz);
        const isOn = cellSet.has(key);
        const st = this.cellStyles.get(key);
        const displaySymbol = st?.emoji ?? st?.stampSymbol ?? (st?.diceValue ? `🎲${st.diceValue}` : isOn ? `${idx + 1}` : '');
        gridCellsHtml.push(`
          <button type="button" class="net-cell ${isOn ? (idx === this.rootIdx ? 'is-root' : 'is-active') : ''}" data-sb-gx="${gx}" data-sb-gz="${gz}">
            ${displaySymbol}
            ${idx === this.rootIdx ? '<span class="net-cell-sub">底</span>' : ''}
          </button>
        `);
      }
    }

    this.controlPanel.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-title">
          <span>① 6×6 方眼マスで展開図をデザイン</span>
          <span class="tile-badge">${matched ? `No.${matched.index} 立方体` : `${this.cells.length}枚`}</span>
        </div>
        <p class="sheet-note">
          マスをタップすると正方形を追加・削除できるよ。スライダーを100%にすると一気に組み立てます！
        </p>

        <div class="net-grid-wrap">
          <div class="net-grid" style="grid-template-columns: repeat(6, 1fr); width: min(100%, 19rem);">
            ${gridCellsHtml.join('')}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem; justify-content:center;">
            <button type="button" class="btn btn-sm" data-sb-preset="cross">十字（立方体）</button>
            <button type="button" class="btn btn-sm" data-sb-preset="openbox">フタなし箱（5枚）</button>
            <button type="button" class="btn btn-sm" data-sb-preset="stairs">かいだん型</button>
            <button type="button" class="btn btn-sm" data-sb-preset="サイコロ">🎲 サイコロ（向かい合う目が7）</button>
            <button type="button" class="btn btn-sm" data-sb-preset="clear">クリア</button>
          </div>
        </div>

        <div class="param-row" style="margin-top:0.25rem;">
          <span class="param-label">折れ曲がり角</span>
          <input type="range" id="sb-angle" min="30" max="120" value="${this.foldAngleDeg}" class="fold-range" />
          <span class="param-val">${this.foldAngleDeg}°</span>
        </div>
      </div>

      <div class="sheet-card">
        <div class="sheet-title">
          <span>② 3Dの面をタップしてデコレーション</span>
        </div>
        <p class="sheet-note">下のシールやサイコロの目をえらんでから、3D画面の面をタップしてみよう！</p>
        <div class="palette-row">
          ${ANIMAL_STICKERS.slice(0, 6)
            .map(
              (st, idx) => `
              <button type="button" class="palette-item ${
                this.activeBrush.kind === 'animal' && this.activeBrush.value === idx ? 'is-selected' : ''
              }" data-brush-kind="animal" data-brush-val="${idx}">
                ${st.emoji} ${st.name}
              </button>
            `
            )
            .join('')}
          ${[1, 2, 3, 4, 5, 6]
            .map(
              d => `
              <button type="button" class="palette-item ${
                this.activeBrush.kind === 'dice' && this.activeBrush.value === d ? 'is-selected' : ''
              }" data-brush-kind="dice" data-brush-val="${d}">
                🎲 ${d}の目
              </button>
            `
            )
            .join('')}
          ${PAINT_STAMPS.slice(0, 4)
            .map(
              (st, idx) => `
              <button type="button" class="palette-item ${
                this.activeBrush.kind === 'stamp' && this.activeBrush.value === idx ? 'is-selected' : ''
              }" data-brush-kind="stamp" data-brush-val="${idx}">
                ${st.symbol} ${st.name}
              </button>
            `
            )
            .join('')}
        </div>
      </div>
    `;

    this.controlPanel.querySelectorAll('[data-sb-gx]').forEach(btn => {
      btn.addEventListener('click', e => {
        const el = e.currentTarget as HTMLElement;
        const gx = Number(el.dataset.sbGx);
        const gz = Number(el.dataset.sbGz);
        const idx = this.cells.findIndex(c => c.x === gx && c.z === gz);
        if (idx >= 0) {
          if (this.cells.length <= 1) return; // 最低1枚は残す
          this.cells.splice(idx, 1);
        } else {
          this.cells.push({ x: gx, z: gz });
        }
        sound.playPop();
        this.rebuildSandbox3D();
        this.renderSandboxUI();
      });
    });

    this.controlPanel.querySelector('#sb-angle')?.addEventListener('input', e => {
      this.foldAngleDeg = Number((e.currentTarget as HTMLInputElement).value);
      this.rebuildSandbox3D();
      this.hooks.setSliderValue(100);
      this.onSliderChange(100);
      this.renderSandboxUI();
    });

    this.controlPanel.querySelectorAll('[data-sb-preset]').forEach(btn => {
      btn.addEventListener('click', e => {
        const p = (e.currentTarget as HTMLElement).dataset.sbPreset;
        this.cellStyles.clear();
        this.foldAngleDeg = 90;
        if (p === 'cross') {
          this.cells = VALID_CUBE_NETS[0].cells.map(c => ({ x: c.x + 1, z: c.z + 1 }));
          this.rootIdx = 2;
        } else if (p === 'openbox') {
          this.cells = [
            { x: 2, z: 1 },
            { x: 1, z: 2 },
            { x: 2, z: 2 },
            { x: 3, z: 2 },
            { x: 2, z: 3 },
          ];
          this.rootIdx = 2;
        } else if (p === 'stairs') {
          this.cells = VALID_CUBE_NETS[9].cells.map(c => ({ x: c.x + 1, z: c.z + 1 }));
          this.rootIdx = 2;
        } else if (p === 'サイコロ') {
          this.cells = VALID_CUBE_NETS[0].cells.map(c => ({ x: c.x + 1, z: c.z + 1 }));
          this.rootIdx = 2;
          // 向かい合う面の合計が 7 になる本物のサイコロ配置
          const diceVals = [2, 4, 1, 3, 6, 5];
          this.cells.forEach((c, i) => {
            this.cellStyles.set(`${c.x},${c.z}`, {
              fill: '#fdfdfa',
              diceValue: diceVals[i],
              label: '',
            });
          });
        } else if (p === 'clear') {
          this.cells = [{ x: 2, z: 2 }];
          this.rootIdx = 0;
        }
        sound.playPop();
        this.rebuildSandbox3D();
        this.renderSandboxUI();
      });
    });

    this.controlPanel.querySelectorAll('[data-brush-kind]').forEach(btn => {
      btn.addEventListener('click', e => {
        const el = e.currentTarget as HTMLElement;
        const kind = el.dataset.brushKind as BrushTool['kind'];
        const val = Number(el.dataset.brushVal);
        this.activeBrush = { kind, value: val, label: '' };
        sound.playPop();
        this.renderSandboxUI();
      });
    });
  }
}
