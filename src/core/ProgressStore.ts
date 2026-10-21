// モードごとのクリア記録・最高スコア・11パターン展開図手帳の発見状況を管理し、
// Google ログイン時は Firebase Firestore と同期するストア (math-quiz と同じ仕組み)

import { firebaseConfig } from '../cloud/config';
import type { CloudService } from '../cloud/firebase';

const STORAGE_KEY = 'math_solids_lab_progress_v1';

export interface LabProgressData {
  scores: Record<string, number>;
  foundCubeNets: string[]; // 'net-01' .. 'net-11'
  cutShapesFound: string[]; // 発見した切断面の種類
}

export type SyncStatus = 'loading' | 'signed-out' | 'syncing' | 'synced' | 'offline';

export interface AccountState {
  available: boolean;
  status: SyncStatus;
  signedIn: boolean;
  loading: boolean;
}

function emptyData(): LabProgressData {
  return {
    scores: {},
    foundCubeNets: ['net-01'],
    cutShapesFound: [],
  };
}

export function mergeProgressData(a: LabProgressData, b: LabProgressData): LabProgressData {
  const scores: Record<string, number> = { ...a.scores };
  for (const [k, v] of Object.entries(b.scores)) {
    if (v > (scores[k] ?? 0)) {
      scores[k] = v;
    }
  }
  const foundCubeNets = Array.from(new Set(['net-01', ...a.foundCubeNets, ...b.foundCubeNets]));
  const cutShapesFound = Array.from(new Set([...a.cutShapesFound, ...b.cutShapesFound]));
  return { scores, foundCubeNets, cutShapesFound };
}

function hasGuestProgress(d: LabProgressData): boolean {
  return (
    Object.values(d.scores).some(v => v > 0) ||
    d.foundCubeNets.length > 1 ||
    d.cutShapesFound.length > 0
  );
}

class ProgressStore {
  private guestData: LabProgressData = emptyData();
  private cloudData: LabProgressData = emptyData();

  private uid: string | null = null;
  private status: SyncStatus = firebaseConfig ? 'loading' : 'signed-out';
  private cloud: CloudService | null = null;
  private interactiveSignIn = false;
  private dirtyModes = new Set<string>();
  private dirtySummary = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.loadLocal();
    if (firebaseConfig && typeof window !== 'undefined') {
      void this.initCloud();
    }
  }

  private get activeData(): LabProgressData {
    return this.uid ? this.cloudData : this.guestData;
  }

  public get account(): AccountState {
    return {
      available: !!firebaseConfig,
      status: this.status,
      signedIn: this.uid !== null,
      loading: this.status === 'loading',
    };
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  private setStatus(next: SyncStatus): void {
    if (this.status !== next) {
      this.status = next;
      this.notify();
    }
  }

  private async initCloud(): Promise<void> {
    try {
      const mod = await import('../cloud/firebase');
      this.cloud = mod.getCloudService();
      this.cloud.onUser(uid => {
        void this.handleUserChange(uid);
      });
    } catch {
      this.setStatus('offline');
    }
  }

  private async handleUserChange(uid: string | null): Promise<void> {
    this.uid = uid;
    this.dirtyModes.clear();
    this.dirtySummary = false;

    if (!uid || !this.cloud) {
      this.interactiveSignIn = false;
      this.setStatus('signed-out');
      this.notify();
      return;
    }

    this.setStatus('syncing');
    const shouldCheckGuest = this.interactiveSignIn;
    this.interactiveSignIn = false;

    try {
      const remoteRes = await this.cloud.loadAll(uid);
      this.cloudData = remoteRes.data;

      if (shouldCheckGuest && hasGuestProgress(this.guestData)) {
        const shouldMigrate =
          !remoteRes.exists ||
          window.confirm('この端末で遊んだ記録があります。ログインしたアカウントに引き継ぎますか？');
        if (shouldMigrate) {
          this.cloudData = mergeProgressData(this.cloudData, this.guestData);
          this.clearLocal();
          await this.pushAllToCloud(uid);
        }
      } else if (!remoteRes.exists) {
        await this.cloud.saveSummary(uid, this.cloudData);
      }

      this.setStatus('synced');
      this.notify();
    } catch {
      this.setStatus('offline');
      this.notify();
    }
  }

  private async pushAllToCloud(uid: string): Promise<void> {
    if (!this.cloud) return;
    await this.cloud.saveSummary(uid, this.cloudData);
    for (const [modeId, sc] of Object.entries(this.cloudData.scores)) {
      if (sc > 0) {
        await this.cloud.saveScore(uid, modeId, sc);
      }
    }
  }

  private async syncPending(): Promise<void> {
    if (!this.uid || !this.cloud) return;
    const uid = this.uid;
    this.setStatus('syncing');
    try {
      if (this.dirtySummary) {
        this.dirtySummary = false;
        await this.cloud.saveSummary(uid, this.cloudData);
      }
      const modes = Array.from(this.dirtyModes);
      this.dirtyModes.clear();
      for (const m of modes) {
        const sc = this.cloudData.scores[m] ?? 0;
        if (sc > 0) {
          await this.cloud.saveScore(uid, m, sc);
        }
      }
      this.setStatus('synced');
    } catch {
      this.setStatus('offline');
    }
  }

  public signIn = async (): Promise<void> => {
    if (!this.cloud) {
      const mod = await import('../cloud/firebase');
      this.cloud = mod.getCloudService();
    }
    this.interactiveSignIn = true;
    try {
      await this.cloud.signIn();
    } catch (err) {
      this.interactiveSignIn = false;
      throw err;
    }
  };

  public signOut = async (force = false): Promise<'ok' | 'unsynced'> => {
    if (!this.cloud) return 'ok';
    await this.syncPending();
    if ((this.dirtyModes.size > 0 || this.dirtySummary) && !force) {
      return 'unsynced';
    }
    await this.cloud.signOut();
    return 'ok';
  };

  private loadLocal(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LabProgressData>;
        this.guestData = {
          scores: parsed.scores ?? {},
          foundCubeNets: parsed.foundCubeNets ?? ['net-01'],
          cutShapesFound: parsed.cutShapesFound ?? [],
        };
      }
    } catch {
      // ignore
    }
  }

  private saveLocal(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.guestData));
    } catch {
      // ignore
    }
  }

  private clearLocal(): void {
    this.guestData = emptyData();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  public getScore(modeId: string): number {
    return this.activeData.scores[modeId] ?? 0;
  }

  public addScore(modeId: string, delta = 1): number {
    const d = this.activeData;
    const next = (d.scores[modeId] ?? 0) + delta;
    d.scores[modeId] = next;
    if (this.uid) {
      this.dirtyModes.add(modeId);
      void this.syncPending();
    } else {
      this.saveLocal();
    }
    return next;
  }

  public setMaxScore(modeId: string, val: number): boolean {
    const d = this.activeData;
    const prev = d.scores[modeId] ?? 0;
    if (val > prev) {
      d.scores[modeId] = val;
      if (this.uid) {
        this.dirtyModes.add(modeId);
        void this.syncPending();
      } else {
        this.saveLocal();
      }
      return true;
    }
    return false;
  }

  public isNetFound(netId: string): boolean {
    return this.activeData.foundCubeNets.includes(netId);
  }

  public markNetFound(netId: string): boolean {
    const d = this.activeData;
    if (!d.foundCubeNets.includes(netId)) {
      d.foundCubeNets.push(netId);
      if (this.uid) {
        this.dirtySummary = true;
        void this.syncPending();
      } else {
        this.saveLocal();
      }
      return true;
    }
    return false;
  }

  public getFoundNetsCount(): number {
    return this.activeData.foundCubeNets.length;
  }

  public markCutShapeFound(shapeName: string): boolean {
    const d = this.activeData;
    if (!d.cutShapesFound.includes(shapeName)) {
      d.cutShapesFound.push(shapeName);
      if (this.uid) {
        this.dirtySummary = true;
        void this.syncPending();
      } else {
        this.saveLocal();
      }
      return true;
    }
    return false;
  }

  public getCutShapesFound(): string[] {
    return this.activeData.cutShapesFound;
  }
}

export const progressStore = new ProgressStore();
