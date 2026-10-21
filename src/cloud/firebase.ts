// Firebase (Google 認証 & Firestore) との連携モジュール
// math-quiz と同じスキーマ:
//   users/{uid}
//   users/{uid}/apps/math-solids-lab
//   users/{uid}/apps/math-solids-lab/progress/{modeId}

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore/lite';
import { firebaseConfig, useEmulator } from './config';
import type { LabProgressData } from '../core/ProgressStore';

export const SCHEMA = 1;
export const APP_ID = 'math-solids-lab';

export interface CloudService {
  onUser(cb: (uid: string | null) => void): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  loadAll(uid: string): Promise<{ exists: boolean; data: LabProgressData }>;
  saveSummary(uid: string, data: LabProgressData): Promise<void>;
  saveScore(uid: string, modeId: string, score: number): Promise<void>;
}

let cachedService: CloudService | null = null;

export function getCloudService(): CloudService {
  if (cachedService) return cachedService;
  if (!firebaseConfig) {
    throw new Error('Firebase の設定がありません');
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const userRef = (uid: string) => doc(db, 'users', uid);
  const appRef = (uid: string) => doc(db, 'users', uid, 'apps', APP_ID);
  const progressCol = (uid: string) => collection(db, 'users', uid, 'apps', APP_ID, 'progress');
  const progressRef = (uid: string, modeId: string) =>
    doc(db, 'users', uid, 'apps', APP_ID, 'progress', modeId);

  cachedService = {
    onUser(cb) {
      onAuthStateChanged(auth, user => {
        cb(user && !user.isAnonymous ? user.uid : null);
      });
    },

    async signIn() {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },

    async signOut() {
      await signOut(auth);
    },

    async loadAll(uid: string) {
      const [summarySnap, progressSnaps] = await Promise.all([
        getDoc(appRef(uid)),
        getDocs(progressCol(uid)),
      ]);

      const scores: Record<string, number> = {};
      progressSnaps.forEach(d => {
        const raw = d.data();
        const sc = raw?.data?.score;
        if (typeof sc === 'number' && sc > 0) {
          scores[d.id] = sc;
        }
      });

      const summaryData = summarySnap.exists() ? summarySnap.data() : null;
      const foundCubeNets = Array.isArray(summaryData?.completed)
        ? summaryData.completed.filter((x: unknown): x is string => typeof x === 'string')
        : ['net-01'];
      if (!foundCubeNets.includes('net-01')) {
        foundCubeNets.unshift('net-01');
      }

      const cutShapesFound = Array.isArray(summaryData?.settings?.cutShapesFound)
        ? summaryData.settings.cutShapesFound.filter((x: unknown): x is string => typeof x === 'string')
        : [];

      return {
        exists: summarySnap.exists() || progressSnaps.size > 0,
        data: {
          scores,
          foundCubeNets,
          cutShapesFound,
        },
      };
    },

    async saveSummary(uid: string, data: LabProgressData) {
      const now = Date.now();
      const uSnap = await getDoc(userRef(uid));
      await setDoc(
        userRef(uid),
        {
          schema: SCHEMA,
          updatedAt: now,
          ...(uSnap.exists() ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      await setDoc(appRef(uid), {
        schema: SCHEMA,
        updatedAt: now,
        activeDays: [],
        completed: data.foundCubeNets,
        inventory: {},
        spent: {},
        settings: {
          cutShapesFound: data.cutShapesFound,
        },
      });
    },

    async saveScore(uid: string, modeId: string, score: number) {
      const now = Date.now();
      await setDoc(progressRef(uid, modeId), {
        schema: SCHEMA,
        updatedAt: now,
        status: 'done',
        data: { score, seconds: 0 },
      });
    },
  };

  return cachedService;
}
