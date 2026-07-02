import { describe, expect, it } from 'vitest';
import { buildPrimer, mergeToRaw } from '../../corpus/conservatory';
import type { MagentaNote } from '../../corpus/conservatory';
import { importFromNotes } from '../../corpus/midi-import';
import { validateStep } from '../step-validator';
import { emptySeq, note } from './helpers';

describe('conservatorio (Magenta) — conversores', () => {
  it('buildPrimer extrae la voz superior derecha del primer compás, monofónica', () => {
    const seq = emptySeq(32);
    seq[0].notes.push(note(69, 'R', 3, 6), note(48, 'L', 5, 8)); // el bajo no entra
    seq[4].notes.push(note(71, 'R', 4, 2), note(64, 'R', 1, 2)); // top: 71
    seq[8].notes.push(note(72, 'R', 5, 12)); // se recorta al compás
    seq[20].notes.push(note(76, 'R', 5, 2)); // fuera del primer: no entra

    const primer = buildPrimer(seq);
    expect(primer.map((n) => n.pitch)).toEqual([69, 71, 72]);
    // Monofónico: cada nota termina donde empieza la siguiente (o antes).
    expect(primer[0].quantizedEndStep).toBeLessThanOrEqual(primer[1].quantizedStartStep);
    expect(primer[2].quantizedEndStep).toBeLessThanOrEqual(16);
  });

  it('mergeToRaw desplaza la continuación tras el primer y convierte a segundos', () => {
    const primer: MagentaNote[] = [{ pitch: 69, quantizedStartStep: 0, quantizedEndStep: 4 }];
    const continuation: MagentaNote[] = [
      { pitch: 71, quantizedStartStep: 0, quantizedEndStep: 2 },
      { pitch: 72, quantizedStartStep: 2, quantizedEndStep: 2 }, // vacía: fuera
    ];
    const raw = mergeToRaw(primer, continuation, 120); // step = 0.125 s
    expect(raw.length).toBe(2);
    expect(raw[0]).toMatchObject({ midi: 69, time: 0, duration: 0.5 });
    expect(raw[1].midi).toBe(71);
    expect(raw[1].time).toBeCloseTo(16 * 0.125, 10); // desplazada tras el primer
  });

  it('la frase del conservatorio pasa por el filtro físico y sale legal', () => {
    // Simula una continuación real de melody_rnn (como la del smoke test).
    const primer: MagentaNote[] = [
      { pitch: 69, quantizedStartStep: 0, quantizedEndStep: 4 },
      { pitch: 71, quantizedStartStep: 4, quantizedEndStep: 6 },
      { pitch: 72, quantizedStartStep: 6, quantizedEndStep: 10 },
      { pitch: 71, quantizedStartStep: 10, quantizedEndStep: 12 },
      { pitch: 69, quantizedStartStep: 12, quantizedEndStep: 16 },
    ];
    const continuation: MagentaNote[] = [
      { pitch: 74, quantizedStartStep: 0, quantizedEndStep: 2 },
      { pitch: 73, quantizedStartStep: 2, quantizedEndStep: 6 },
      { pitch: 71, quantizedStartStep: 6, quantizedEndStep: 8 },
      { pitch: 69, quantizedStartStep: 8, quantizedEndStep: 12 },
      { pitch: 74, quantizedStartStep: 12, quantizedEndStep: 16 },
      { pitch: 73, quantizedStartStep: 16, quantizedEndStep: 18 },
      { pitch: 71, quantizedStartStep: 18, quantizedEndStep: 22 },
      { pitch: 69, quantizedStartStep: 22, quantizedEndStep: 24 },
      { pitch: 71, quantizedStartStep: 24, quantizedEndStep: 28 },
      { pitch: 73, quantizedStartStep: 28, quantizedEndStep: 32 },
    ];
    const raw = mergeToRaw(primer, continuation, 75);
    const piece = importFromNotes('conservatorio', raw, 75, 'midi');
    expect(piece.windowsByBars[2].length).toBeGreaterThan(0);
    for (const s of piece.windowsByBars[2][0].steps) {
      expect(validateStep(s.notes).legal).toBe(true);
    }
  });
});
