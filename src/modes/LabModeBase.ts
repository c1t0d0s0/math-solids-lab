import { SceneManager } from '../core/SceneManager';

export interface LabUIHooks {
  setSliderValue: (percent: number, label?: string) => void;
  setSliderVisible: (visible: boolean, labelText?: string) => void;
  setViewportBadge: (text: string, state?: 'normal' | 'ok' | 'alert') => void;
  setMeterContent: (html: string) => void;
  getAssistEnabled: () => boolean;
}

export interface LabModeController {
  mount(sceneManager: SceneManager, controlPanel: HTMLElement, hooks: LabUIHooks): void;
  onSliderChange(percent: number): void;
  onAssistToggle(enabled: boolean): void;
  dispose(): void;
}
