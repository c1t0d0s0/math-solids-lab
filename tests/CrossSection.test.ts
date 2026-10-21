import { describe, it, expect } from 'vitest';
import { computeCubeCrossSection } from '../src/engine/CrossSectionEngine';

describe('CrossSectionEngine (Cube Slicer)', () => {
  it('computes a Square cross-section when sliced parallel to a face', () => {
    const res = computeCubeCrossSection({ x: 0, y: 1, z: 0 }, 0);
    expect(res.vertexCount).toBe(4);
    expect(res.shapeName).toBe('正方形');
  });

  it('computes a Rectangle cross-section when sliced at 45 degrees along one axis', () => {
    const res = computeCubeCrossSection({ x: 1, y: 1, z: 0 }, 0);
    expect(res.vertexCount).toBe(4);
    expect(res.shapeName).toBe('長方形');
  });

  it('computes an Equilateral Triangle cross-section near a corner along (1,1,1)', () => {
    const res = computeCubeCrossSection({ x: 1, y: 1, z: 1 }, 1.1);
    expect(res.vertexCount).toBe(3);
    expect(res.shapeName).toBe('正三角形');
  });

  it('computes a Pentagon cross-section when slicing through 5 faces', () => {
    const res = computeCubeCrossSection({ x: 0.8, y: 0.5, z: 0.4 }, 0.38);
    expect(res.vertexCount).toBe(5);
    expect(res.shapeName).toBe('五角形');
  });

  it('computes a Regular Hexagon cross-section through the origin with normal (1,1,1)', () => {
    const res = computeCubeCrossSection({ x: 1, y: 1, z: 1 }, 0);
    expect(res.vertexCount).toBe(6);
    expect(res.shapeName).toBe('正六角形');
  });
});
