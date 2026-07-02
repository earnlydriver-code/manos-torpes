import { describe, expect, it } from 'vitest';
import { computeTexture, meanTexture, textureSimilarity } from '../texture';
import { emptySeq, note } from './helpers';
import type { Step } from '../../types/music';

/** 2 compases con `perBar` onsets/compás y acordes de `voices` notas. */
function textured(perBar: number, voices: number): Step[] {
  const seq = emptySeq(32);
  for (let bar = 0; bar < 2; bar++) {
    for (let i = 0; i < perBar; i++) {
      const t = bar * 16 + Math.floor((i * 16) / perBar);
      for (let v = 0; v < voices; v++) {
        seq[t].notes.push(note(60 + v * 4 + (i % 3), v === 0 ? 'R' : 'L', ((v % 5) + 1) as never, 2));
      }
    }
  }
  return seq;
}

describe('computeTexture + textureSimilarity (el vacío no es consonancia gratis)', () => {
  it('mide ataques por compás y voces simultáneas', () => {
    const t = computeTexture(textured(8, 2));
    expect(t.onsetsPerBar).toBe(8);
    expect(t.voices).toBeGreaterThanOrEqual(1.5);
  });

  it('el genoma ESCASO (el exploit de las 10 notas) pierde contra el denso', () => {
    const ref = computeTexture(textured(8, 2)); // la música real
    const sparse = emptySeq(32);
    // El exploit del Usuario: 3 notas izquierda + 7 derecha en toda la pieza.
    [0, 10, 22].forEach((t, i) => sparse[t].notes.push(note(48 + i, 'L', 3, 2)));
    [2, 6, 12, 16, 20, 26, 30].forEach((t, i) => sparse[t].notes.push(note(66 + i, 'R', 3, 2)));
    const dense = textured(7, 2);
    expect(textureSimilarity(sparse, ref)).toBeLessThan(0.6);
    expect(textureSimilarity(dense, ref)).toBeGreaterThan(0.85);
    expect(textureSimilarity(dense, ref)).toBeGreaterThan(textureSimilarity(sparse, ref));
  });

  it('también castiga el atiborramiento (no solo el vacío)', () => {
    const ref = computeTexture(textured(4, 1)); // corpus aireado
    const stuffed = textured(16, 4);
    expect(textureSimilarity(stuffed, ref)).toBeLessThan(0.6);
  });

  it('sin referencia no opina (1) y meanTexture promedia', () => {
    expect(textureSimilarity(emptySeq(16), { onsetsPerBar: 0, voices: 0 })).toBe(1);
    const m = meanTexture([
      { onsetsPerBar: 4, voices: 1 },
      { onsetsPerBar: 8, voices: 3 },
    ]);
    expect(m.onsetsPerBar).toBe(6);
    expect(m.voices).toBe(2);
  });
});
