import { describe, expect, it } from 'vitest';
import { estimateBpm } from '../../corpus/audio-import';
import type { RawNote } from '../../corpus/midi-import';

function notesAt(bpm: number, count: number, everyNthStep: number): RawNote[] {
  const stepSec = 60 / bpm / 4;
  return Array.from({ length: count }, (_, i) => ({
    midi: 60 + (i % 12),
    time: i * everyNthStep * stepSec,
    duration: stepSec,
    velocity: 0.8,
  }));
}

describe('estimateBpm', () => {
  it('recupera el tempo de onsets perfectamente cuantizados', () => {
    // Corcheas a 120 BPM. La rejilla de semicorcheas es ambigua entre
    // múltiplos (60/120 encajan igual de bien) — debe caer en uno de ellos.
    expect([60, 120]).toContain(estimateBpm(notesAt(120, 40, 2)));
    expect([70, 140]).toContain(estimateBpm(notesAt(140, 40, 2)));
  });

  it('tolera ruido de transcripción (±15 ms)', () => {
    const clean = notesAt(100, 48, 2);
    let s = 12345;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const noisy = clean.map((n) => ({ ...n, time: Math.max(0, n.time + (rand() - 0.5) * 0.03) }));
    const est = estimateBpm(noisy);
    expect([50, 100].some((t) => Math.abs(est - t) <= 3)).toBe(true);
  });

  it('con pocas notas devuelve el tempo por defecto (100)', () => {
    expect(estimateBpm(notesAt(120, 4, 2))).toBe(100);
    expect(estimateBpm([])).toBe(100);
  });
});
