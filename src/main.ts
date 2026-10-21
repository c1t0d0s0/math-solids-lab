import './styles/main.css';
import {
  GRADES,
  GradeFilterId,
  MODE_GROUPS,
  MODES,
  ModeId,
  isModeVisible,
  findModeMeta,
} from './modes/ModesConfig';
import { renderHanamaruSvg, renderMonkeySvg } from './core/SvgIcons';
import { progressStore } from './core/ProgressStore';
import { sound } from './core/SoundManager';
import { SceneManager } from './core/SceneManager';
import { LabModeController, LabUIHooks } from './modes/LabModeBase';
import { Grade12Mode } from './modes/Grade12Mode';
import { Grade34Mode } from './modes/Grade34Mode';
import { Grade56Mode } from './modes/Grade56Mode';
import { SandboxMode } from './modes/SandboxMode';

const ACCOUNT_STATUS_TEXT: Record<string, string> = {
  syncing: '保存中…',
  synced: '保存ずみ',
  offline: 'まだ保存できていません。つながったら保存します。',
};

class MathSolidsLabApp {
  private rootEl: HTMLElement;
  private currentGrade: GradeFilterId = 'all';
  private activeModeId: ModeId | null = null;
  private assistEnabled = true;
  private authBusy = false;
  private authError = '';

  private sceneManager: SceneManager | null = null;
  private activeController: LabModeController | null = null;

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    progressStore.subscribe(() => {
      if (this.activeModeId === null) {
        this.renderHome();
      }
    });
    this.renderHome();
  }

  private renderAccountBoxHtml(): string {
    const account = progressStore.account;
    if (!account.available) return '';

    let bodyHtml = '';
    if (account.status === 'loading') {
      bodyHtml = `<p class="account-status">たしかめています…</p>`;
    } else if (!account.signedIn) {
      bodyHtml = `
        <p class="account-note">Google でログインすると、記録が保存されて、ほかのブラウザや端末でも同じ記録で遊べます。ログインしなくても遊べます。</p>
        <button id="sign-in-button" type="button" class="btn btn-primary" ${this.authBusy ? 'disabled' : ''}>Google でログイン</button>
        ${this.authError ? `<p class="account-error" role="alert">${this.authError}</p>` : ''}
      `;
    } else {
      const stText = ACCOUNT_STATUS_TEXT[account.status] ?? '';
      bodyHtml = `
        <p class="account-state">
          <b>ログイン中</b>
          <span class="account-status is-${account.status}" role="status">${stText}</span>
        </p>
        <button id="sign-out-button" type="button" class="btn" ${this.authBusy ? 'disabled' : ''}>ログアウト</button>
      `;
    }

    return `
      <section class="account" aria-labelledby="account-title">
        <h2 id="account-title">記録の保存</h2>
        ${bodyHtml}
      </section>
    `;
  }

  private renderHome(): void {
    if (this.activeController) {
      this.activeController.dispose();
      this.activeController = null;
    }
    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    this.activeModeId = null;

    const visibleGroups = MODE_GROUPS.map(g => ({
      ...g,
      modes: MODES.filter(m => m.groupKind === g.kind && isModeVisible(m, this.currentGrade)),
    })).filter(g => g.modes.length > 0);

    const foundNets = progressStore.getFoundNetsCount();
    const totalPoints = progressStore.getTotalPoints();
    const account = progressStore.account;

    this.rootEl.innerHTML = `
      <main id="start-container" class="home">
        <div class="home-side">
          <header class="hero">
            <div class="crest" aria-hidden="true">
              <span class="crest-cell">□</span>
              <span class="crest-cell">△</span>
              <span class="crest-cell crest-cross">展</span>
              <span class="crest-cell">○</span>
            </div>
            <div class="hero-text">
              <h1 class="brand">立体と展開図ラボ</h1>
              <p class="lead">さいころの展開図から回転体・切断面まで。スライダーを動かして3Dで実験しよう。</p>
            </div>
            ${renderMonkeySvg()}
          </header>

          <div class="mode grade-tabs" role="group" aria-label="学年の切りかえ">
            ${GRADES.map(
              g => `
                <button
                  type="button"
                  class="mode-option grade-tab"
                  aria-pressed="${this.currentGrade === g.id}"
                  data-grade="${g.id}"
                >
                  <span class="mode-label">${g.label}</span>
                </button>
              `
            ).join('')}
          </div>

          <nav class="reward-links" aria-label="ずかんとじゆうさくせい">
            <p class="points">
              <span class="points-label">ラボポイント</span>
              <b class="points-num">${account.loading ? '…' : `${totalPoints} pt`}</b>
            </p>
            <div class="reward-buttons">
              <button type="button" class="btn" id="quick-notebook">
                📖 11展開図ずかん (${account.loading ? '…' : `${foundNets}/11`})
              </button>
              <button type="button" class="btn btn-primary" id="quick-sandbox">
                🛠️ じゆうさくせい
              </button>
            </div>
          </nav>

          ${this.renderAccountBoxHtml()}
        </div>

        <div class="home-main">
          ${visibleGroups
            .map(
              group => `
              <section aria-labelledby="kind-${group.kind}">
                <h2 id="kind-${group.kind}">${group.title}</h2>
                <p class="section-note">${group.note}</p>
                <div class="tiles">
                  ${group.modes
                    .map(mode => {
                      const score =
                        mode.id === 'g34-notebook'
                          ? foundNets
                          : progressStore.getScore(mode.id);
                      const isMastered = !account.loading && score >= mode.goalCount;
                      const recordHtml = account.loading
                        ? '読みこみ中…'
                        : `記録: <b>${score}</b> / ${mode.goalCount} ${mode.unit}`;
                      return `
                        <button
                          type="button"
                          id="mode-${mode.id}"
                          class="tile mode-button"
                          data-mode="${mode.id}"
                        >
                          <span class="tile-badge">${mode.badge}</span>
                          <span class="tile-title">${mode.title}</span>
                          <span class="tile-meta">${mode.desc}</span>
                          <span class="tile-record high-score-tag">
                            ${recordHtml}
                          </span>
                          ${isMastered ? renderHanamaruSvg('hanamaru hanamaru-small', false) : ''}
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </section>
            `
            )
            .join('')}
        </div>
      </main>
    `;

    this.rootEl.querySelectorAll('[data-grade]').forEach(btn => {
      btn.addEventListener('click', e => {
        const g = (e.currentTarget as HTMLElement).dataset.grade as GradeFilterId;
        this.currentGrade = g;
        sound.playPop();
        this.renderHome();
      });
    });

    this.rootEl.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', e => {
        const modeId = (e.currentTarget as HTMLElement).dataset.mode as ModeId;
        sound.playPop();
        this.startMode(modeId);
      });
    });

    this.rootEl.querySelector('#quick-notebook')?.addEventListener('click', () => {
      sound.playPop();
      this.startMode('g34-notebook');
    });

    this.rootEl.querySelector('#quick-sandbox')?.addEventListener('click', () => {
      sound.playPop();
      this.startMode('sandbox');
    });

    this.rootEl.querySelector('#sign-in-button')?.addEventListener('click', async () => {
      this.authBusy = true;
      this.authError = '';
      this.renderHome();
      try {
        await progressStore.signIn();
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? '';
        if (!/popup-closed-by-user|cancelled-popup-request/.test(code)) {
          this.authError =
            'ログインできませんでした。もういちどためしてください。' + (code ? ` (${code})` : '');
        }
      } finally {
        this.authBusy = false;
        this.renderHome();
      }
    });

    this.rootEl.querySelector('#sign-out-button')?.addEventListener('click', async () => {
      this.authBusy = true;
      this.renderHome();
      try {
        const res = await progressStore.signOut();
        if (
          res === 'unsynced' &&
          window.confirm(
            'まだ保存できていない記録があります。今ログアウトすると、その分はなくなります。ログアウトしますか？'
          )
        ) {
          await progressStore.signOut(true);
        }
      } finally {
        this.authBusy = false;
        this.renderHome();
      }
    });
  }

  private startMode(modeId: ModeId): void {
    this.activeModeId = modeId;
    const meta = findModeMeta(modeId);

    this.rootEl.innerHTML = `
      <div class="lab-page">
        <header class="bar">
          <button type="button" class="back home-btn" id="btn-home">
            <span aria-hidden="true">‹</span>もどる
          </button>
          <h1>${meta.title}</h1>
          <div class="bar-tools">
            <button type="button" class="btn btn-sm ${this.assistEnabled ? 'btn-active' : ''}" id="btn-assist" title="展開図の面・辺・頂点の対応ハイライト">
              💡 ヒント ${this.assistEnabled ? 'ON' : 'OFF'}
            </button>
            <button type="button" class="btn btn-sm" id="btn-sound" title="効果音のオン・オフ">
              ${sound.enabled ? '🔊 音ON' : '🔇 音OFF'}
            </button>
          </div>
        </header>

        <div class="meter" id="lab-meter"></div>

        <div class="lab-layout">
          <div class="viewport-col">
            <div class="viewport-sheet">
              <div class="viewport-overlay-top">
                <div class="viewport-badge" id="viewport-badge">3Dビュー：スワイプで回転できるよ</div>
                <div class="viewport-cam-btns">
                  <button type="button" class="cam-btn" id="cam-iso">ななめ視点</button>
                  <button type="button" class="cam-btn" id="cam-top">真上から</button>
                </div>
              </div>
              <div class="canvas-container" id="three-canvas-container"></div>
              <div class="viewport-overlay-bottom">
                <span class="viewport-hint">👆 1本指スワイプ：360°回転 ／ ピンチ・ホイール：拡大縮小</span>
              </div>
            </div>

            <div class="fold-slider-card" id="fold-slider-card">
              <div class="fold-slider-head">
                <label for="fold-slider-input" class="fold-slider-label" id="fold-slider-label">
                  📦 組み立てスライダー
                </label>
                <span class="fold-slider-pct" id="fold-slider-pct">0%（展開図）</span>
              </div>
              <div class="fold-slider-row">
                <button type="button" class="fold-Quick-btn" id="slider-btn-0">0% ひらく</button>
                <input
                  type="range"
                  id="fold-slider-input"
                  class="fold-range"
                  min="0"
                  max="100"
                  step="1"
                  value="0"
                  aria-label="組み立てスライダー"
                />
                <button type="button" class="fold-Quick-btn" id="slider-btn-100">100% 閉じる</button>
              </div>
            </div>
          </div>

          <div class="control-col" id="lab-control-panel"></div>
        </div>
      </div>
    `;

    const canvasContainer = document.getElementById('three-canvas-container')!;
    const controlPanel = document.getElementById('lab-control-panel')!;
    const meterEl = document.getElementById('lab-meter')!;
    const badgeEl = document.getElementById('viewport-badge')!;
    const sliderCard = document.getElementById('fold-slider-card')!;
    const sliderInput = document.getElementById('fold-slider-input') as HTMLInputElement;
    const sliderLabel = document.getElementById('fold-slider-label')!;
    const sliderPct = document.getElementById('fold-slider-pct')!;

    this.sceneManager = new SceneManager(canvasContainer);

    const updatePctDisplay = (pct: number) => {
      if (pct <= 0) {
        sliderPct.textContent = '0%（平らな展開図）';
      } else if (pct >= 100) {
        sliderPct.textContent = '100%（閉じた立体）';
      } else {
        sliderPct.textContent = `${pct}%`;
      }
    };

    const hooks: LabUIHooks = {
      setSliderValue: (percent: number, label?: string) => {
        sliderInput.value = String(percent);
        updatePctDisplay(percent);
        if (label) sliderLabel.textContent = `📦 ${label}`;
      },
      setSliderVisible: (visible: boolean, labelText?: string) => {
        sliderCard.style.display = visible ? 'grid' : 'none';
        if (labelText) sliderLabel.textContent = `📦 ${labelText}`;
      },
      setViewportBadge: (text: string, state: 'normal' | 'ok' | 'alert' = 'normal') => {
        badgeEl.textContent = text;
        badgeEl.className = 'viewport-badge';
        if (state === 'ok') badgeEl.classList.add('is-ok');
        if (state === 'alert') badgeEl.classList.add('is-alert');
      },
      setMeterContent: (html: string) => {
        meterEl.innerHTML = html;
      },
      getAssistEnabled: () => this.assistEnabled,
    };

    // モードコントローラー生成
    switch (modeId) {
      case 'g12-stamper':
        this.activeController = new Grade12Mode('stamper');
        break;
      case 'g12-sticker':
        this.activeController = new Grade12Mode('sticker');
        break;
      case 'g34-judge':
        this.activeController = new Grade34Mode('judge');
        break;
      case 'g34-notebook':
        this.activeController = new Grade34Mode('notebook');
        break;
      case 'g34-vertex':
        this.activeController = new Grade34Mode('vertex');
        break;
      case 'g56-craft':
        this.activeController = new Grade56Mode('craft');
        break;
      case 'g56-revolve':
        this.activeController = new Grade56Mode('revolve');
        break;
      case 'g56-cutter':
        this.activeController = new Grade56Mode('cutter');
        break;
      case 'sandbox':
        this.activeController = new SandboxMode();
        break;
    }

    this.activeController.mount(this.sceneManager, controlPanel, hooks);

    // 共通イベントバインド
    document.getElementById('btn-home')?.addEventListener('click', () => {
      sound.playPop();
      this.renderHome();
    });

    document.getElementById('btn-assist')?.addEventListener('click', e => {
      this.assistEnabled = !this.assistEnabled;
      const btn = e.currentTarget as HTMLElement;
      btn.textContent = `💡 ヒント ${this.assistEnabled ? 'ON' : 'OFF'}`;
      btn.classList.toggle('btn-active', this.assistEnabled);
      sound.playPop();
      this.activeController?.onAssistToggle(this.assistEnabled);
    });

    document.getElementById('btn-sound')?.addEventListener('click', e => {
      const enabled = sound.toggle();
      (e.currentTarget as HTMLElement).textContent = enabled ? '🔊 音ON' : '🔇 音OFF';
    });

    document.getElementById('cam-iso')?.addEventListener('click', () => {
      this.sceneManager?.resetCamera();
    });

    document.getElementById('cam-top')?.addEventListener('click', () => {
      this.sceneManager?.setTopView();
    });

    sliderInput.addEventListener('input', () => {
      const pct = Number(sliderInput.value);
      updatePctDisplay(pct);
      this.activeController?.onSliderChange(pct);
    });

    document.getElementById('slider-btn-0')?.addEventListener('click', () => {
      sliderInput.value = '0';
      updatePctDisplay(0);
      this.activeController?.onSliderChange(0);
    });

    document.getElementById('slider-btn-100')?.addEventListener('click', () => {
      sliderInput.value = '100';
      updatePctDisplay(100);
      this.activeController?.onSliderChange(100);
    });

    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }
}

const appRoot = document.getElementById('app');
if (appRoot) {
  new MathSolidsLabApp(appRoot);
}
