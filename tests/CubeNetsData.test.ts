import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  VALID_CUBE_NETS,
  INVALID_CUBE_NETS,
  analyzeNetFolding,
  normalizeGridCells,
  matchCubeNetPattern,
} from '../src/engine/CubeNetsData';
import { NetFoldingEngine } from '../src/engine/NetFoldingEngine';
import { resolveGrade } from '../src/modes/ModesConfig';

describe('CubeNetsData & 3D Folding Analysis', () => {
  it('validates all 11 canonical cube nets fold without collision and cover all 6 faces', () => {
    expect(VALID_CUBE_NETS.length).toBe(11);

    for (const pat of VALID_CUBE_NETS) {
      expect(pat.cells.length).toBe(6);
      const analysis = analyzeNetFolding(pat.cells, pat.rootIndex);
      expect(analysis.isConnected).toBe(true);
      expect(analysis.collidingFacePairs).toHaveLength(0);
      expect(analysis.missingSlots).toHaveLength(0);
      expect(analysis.isValidCube).toBe(true);
      expect(analysis.oppositePairs).toHaveLength(3);
      expect(analysis.vertexGroups).toHaveLength(8);
      expect(analysis.edgeGroups).toHaveLength(12);
    }
  });

  it('produces 11 unique normalized keys for the 11 cube nets', () => {
    const keys = new Set(VALID_CUBE_NETS.map(p => normalizeGridCells(p.cells)));
    expect(keys.size).toBe(11);
  });

  it('matches rotated and flipped cube nets to their canonical pattern', () => {
    for (const pat of VALID_CUBE_NETS) {
      // 90度回転 + 平行移動
      const rotated = pat.cells.map(c => ({ x: -c.z + 10, z: c.x + 5 }));
      const matchedRot = matchCubeNetPattern(rotated);
      expect(matchedRot?.id).toBe(pat.id);

      // 左右反転 + 平行移動
      const flipped = pat.cells.map(c => ({ x: -c.x + 7, z: c.z + 3 }));
      const matchedFlip = matchCubeNetPattern(flipped);
      expect(matchedFlip?.id).toBe(pat.id);
    }
  });

  it('detects face collisions and missing face slots on all invalid dummy nets', () => {
    for (const bad of INVALID_CUBE_NETS) {
      const analysis = analyzeNetFolding(bad.cells, bad.rootIndex);
      expect(analysis.isValidCube).toBe(false);
      expect(analysis.collidingFacePairs.length).toBeGreaterThan(0);
      expect(analysis.missingSlots.length).toBeGreaterThan(0);
      expect(matchCubeNetPattern(bad.cells)).toBeNull();
    }
  });

  it('folds all 11 cube nets in Three.js NetFoldingEngine into an exact 3D cube at 100%', () => {
    const expectedCubeFaceCenters = [
      '0,0,0',
      '0,1,0',
      '0.5,0.5,0',
      '-0.5,0.5,0',
      '0,0.5,0.5',
      '0,0.5,-0.5',
    ].sort();

    for (const pat of VALID_CUBE_NETS) {
      for (let rIdx = 0; rIdx < 6; rIdx++) {
        const engine = new NetFoldingEngine(pat.cells, rIdx);
        engine.setFoldProgress(100, true);
        engine.rootObject.updateMatrixWorld(true);

        const faceMeshes: THREE.Object3D[] = [];
        engine.rootObject.traverse(obj => {
          if (obj.userData && obj.userData.kind === 'face') {
            faceMeshes.push(obj);
          }
        });

        expect(faceMeshes).toHaveLength(6);

        const worldCenters = faceMeshes
          .map(m => {
            const wp = new THREE.Vector3();
            m.getWorldPosition(wp);
            const rx = Math.round(wp.x * 100) / 100;
            const ry = Math.round(wp.y * 100) / 100;
            const rz = Math.round(wp.z * 100) / 100;
            return `${rx},${ry},${rz}`;
          })
          .sort();

        expect(worldCenters).toEqual(expectedCubeFaceCenters);
      }
    }
  });

  it('resolves ?grade=1..6 query parameters to the corresponding grade tab', () => {
    expect(resolveGrade('1')).toBe('low');
    expect(resolveGrade('2')).toBe('low');
    expect(resolveGrade('3')).toBe('mid');
    expect(resolveGrade('4')).toBe('mid');
    expect(resolveGrade('5')).toBe('high');
    expect(resolveGrade('6')).toBe('high');
    expect(resolveGrade(null)).toBe('all');
    expect(resolveGrade('')).toBe('all');
    expect(resolveGrade('unknown')).toBe('all');
  });
});
