// モードごとのクリア記録・最高スコア・11パターン展開図手帳の発見状況を管理するストア

const STORAGE_KEY = 'math_solids_lab_progress_v1';

export interface LabProgressData {
  scores: Record<string, number>;
  foundCubeNets: string[]; // 'net-01' .. 'net-11'
  cutShapesFound: string[]; // 発見した切断面の種類
}

class ProgressStore {
  private data: LabProgressData = {
    scores: {},
    foundCubeNets: ['net-01'], // 最初の十字型はサンプルとして登録済み
    cutShapesFound: [],
  };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LabProgressData>;
        this.data = {
          scores: parsed.scores ?? {},
          foundCubeNets: parsed.foundCubeNets ?? ['net-01'],
          cutShapesFound: parsed.cutShapesFound ?? [],
        };
      }
    } catch {
      // ignore
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore
    }
  }

  public getScore(modeId: string): number {
    return this.data.scores[modeId] ?? 0;
  }

  public addScore(modeId: string, delta = 1): number {
    const next = (this.data.scores[modeId] ?? 0) + delta;
    this.data.scores[modeId] = next;
    this.save();
    return next;
  }

  public setMaxScore(modeId: string, val: number): boolean {
    const prev = this.data.scores[modeId] ?? 0;
    if (val > prev) {
      this.data.scores[modeId] = val;
      this.save();
      return true;
    }
    return false;
  }

  public isNetFound(netId: string): boolean {
    return this.data.foundCubeNets.includes(netId);
  }

  public markNetFound(netId: string): boolean {
    if (!this.data.foundCubeNets.includes(netId)) {
      this.data.foundCubeNets.push(netId);
      this.save();
      return true;
    }
    return false;
  }

  public getFoundNetsCount(): number {
    return this.data.foundCubeNets.length;
  }

  public markCutShapeFound(shapeName: string): boolean {
    if (!this.data.cutShapesFound.includes(shapeName)) {
      this.data.cutShapesFound.push(shapeName);
      this.save();
      return true;
    }
    return false;
  }

  public getCutShapesFound(): string[] {
    return this.data.cutShapesFound;
  }

  public getTotalPoints(): number {
    const modePts = Object.values(this.data.scores).reduce((a, b) => a + b * 10, 0);
    const netPts = this.data.foundCubeNets.length * 20;
    const cutPts = this.data.cutShapesFound.length * 15;
    return modePts + netPts + cutPts;
  }
}

export const progressStore = new ProgressStore();
