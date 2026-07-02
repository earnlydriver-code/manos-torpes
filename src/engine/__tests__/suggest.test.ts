import { describe, expect, it } from 'vitest';
import { importFromNotes } from '../../corpus/midi-import';
import type { RawNote } from '../../corpus/midi-import';
import { suggestTraining } from '../../corpus/suggest';

/** Pieza sintética: `perBeat` notas por pulso a `bpm`, `beats` pulsos. */
function makePiece(bpm: number, perBeat: number, beats = 64) {
  const beatSec = 60 / bpm;
  const notes: RawNote[] = [];
  for (let b = 0; b < beats; b++) {
    for (let i = 0; i < perBeat; i++) {
      notes.push({
        midi: 60 + ((b * perBeat + i) % 12),
        time: b * beatSec + (i * beatSec) / perBeat,
        duration: beatSec / perBeat,
        velocity: 0.8,
      });
    }
  }
  return importFromNotes(`sintetica-${bpm}`, notes, bpm, 'midi');
}

describe('suggestTraining (auto tempo y compases)', () => {
  it('sin corpus no hay sugerencia', () => {
    expect(suggestTraining([])).toBeNull();
  });

  it('el tempo sugerido es la mediana de los tempos reales', () => {
    const s = suggestTraining([makePiece(70, 2), makePiece(76, 2), makePiece(130, 2)]);
    expect(s).not.toBeNull();
    expect(s!.tempo).toBe(76);
  });

  it('música densa sugiere frases cortas; música espaciada, largas', () => {
    // 4 notas por pulso = 16 ataques/compás ⇒ 2 compases.
    expect(suggestTraining([makePiece(100, 4)])!.bars).toBe(2);
    // 1 nota por pulso = 4 ataques/compás ⇒ 4 compases.
    expect(suggestTraining([makePiece(100, 1)])!.bars).toBe(4);
  });

  it('tolera piezas viejas sin bpm ni windowsByBars (usa windows[0].tempo)', () => {
    const modern = makePiece(90, 2);
    const legacy = { windows: modern.windows, melodySeqs: modern.melodySeqs };
    const s = suggestTraining([legacy]);
    expect(s).not.toBeNull();
    expect(s!.tempo).toBe(90);
  });
});
