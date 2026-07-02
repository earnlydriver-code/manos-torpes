import { describe, expect, it } from 'vitest';
import {
  ChordModel,
  chordSequence,
  detectChordSegments,
  detectKeyRoot,
  harmonicSimilarity,
} from '../chords';
import { mulberry32 } from '../rng';
import { emptySeq, note } from './helpers';
import type { Step } from '../../types/music';

/** Medio compás (8 steps) con un acorde sostenido + la melodía en la tónica del acorde. */
function chordSegmentSteps(seq: Step[], segIndex: number, rootMidi: number, quality: 'M' | 'm') {
  const t = segIndex * 8;
  const third = rootMidi + (quality === 'M' ? 4 : 3);
  seq[t].notes.push(
    note(rootMidi, 'L', 5, 8, 0.8),
    note(third, 'L', 3, 8, 0.7),
    note(rootMidi + 7, 'L', 1, 8, 0.7),
  );
  seq[t].notes.push(note(rootMidi + 24, 'R', 1, 4, 0.8));
  seq[t + 4].notes.push(note(third + 24, 'R', 3, 4, 0.8));
}

/** I–V–vi–IV en Do mayor sobre 2 compases (4 medios compases). */
function progressionIVviIV(): Step[] {
  const seq = emptySeq(32);
  chordSegmentSteps(seq, 0, 48, 'M'); // C
  chordSegmentSteps(seq, 1, 55, 'M'); // G
  chordSegmentSteps(seq, 2, 57, 'm'); // Am
  chordSegmentSteps(seq, 3, 53, 'M'); // F
  return seq;
}

describe('detección de acordes', () => {
  it('detecta I–V–vi–IV como grados relativos a la tonalidad', () => {
    const seq = progressionIVviIV();
    const keyRoot = detectKeyRoot(seq);
    const symbols = detectChordSegments(seq, keyRoot).map((s) => s.symbol);
    // En Do mayor: C=0M, G=7M, Am=9m, F=5M (keyRoot=0). Si Krumhansl eligiera
    // la relativa (La menor), los grados rotan pero siguen siendo consistentes.
    const asString = symbols.join(' ');
    expect(['0M 7M 9m 5M', '3M 10M 0m 8M']).toContain(asString);
  });

  it('música sin acordes claros produce N, no un acorde inventado', () => {
    const seq = emptySeq(16);
    // Cluster cromático sostenido: no es tríada.
    seq[0].notes.push(note(60, 'R', 1, 16), note(61, 'R', 2, 16), note(62, 'R', 3, 16));
    const segments = detectChordSegments(seq, 0);
    expect(segments.every((s) => s.symbol === 'N')).toBe(true);
  });

  it('la MISMA progresión transportada produce los MISMOS símbolos (invariante)', () => {
    const inC = progressionIVviIV();
    const inD = emptySeq(32);
    chordSegmentSteps(inD, 0, 50, 'M');
    chordSegmentSteps(inD, 1, 57, 'M');
    chordSegmentSteps(inD, 2, 59, 'm');
    chordSegmentSteps(inD, 3, 55, 'M');
    expect(chordSequence(inC).join(' ')).toBe(chordSequence(inD).join(' '));
  });
});

describe('ChordModel', () => {
  const corpus = [
    ['0M', '7M', '9m', '5M'],
    ['0M', '7M', '9m', '5M'],
    ['0M', '5M', '7M', '0M'],
    ['9m', '5M', '0M', '7M'],
  ];

  it('las progresiones del corpus puntúan mejor que las aleatorias', () => {
    const model = new ChordModel();
    model.train(corpus);
    expect(model.avgLogProb(['0M', '7M', '9m', '5M'])).toBeGreaterThan(
      model.avgLogProb(['1m', '6M', '2m', '10M']),
    );
  });

  it('sample sigue las transiciones aprendidas y es determinista', () => {
    const model = new ChordModel();
    model.train(corpus);
    const a = mulberry32(9);
    const b = mulberry32(9);
    const fromA = Array.from({ length: 10 }, () => model.sample(a, '0M'));
    const fromB = Array.from({ length: 10 }, () => model.sample(b, '0M'));
    expect(fromA).toEqual(fromB);
    for (const s of fromA) expect(['7M', '5M']).toContain(s); // lo que sigue a 0M en el corpus
  });

  it('sobrevive a serializar/deserializar', () => {
    const model = new ChordModel();
    model.train(corpus);
    const revived = ChordModel.fromJSON(JSON.parse(JSON.stringify(model.toJSON())));
    expect(revived.avgLogProb(['0M', '7M'])).toBeCloseTo(model.avgLogProb(['0M', '7M']), 12);
    const a = mulberry32(4);
    const b = mulberry32(4);
    expect(revived.sample(a, '0M')).toBe(model.sample(b, '0M'));
  });
});

describe('harmonicSimilarity', () => {
  it('una progresión del corpus con acordes claros puntúa alto; el caos, bajo', () => {
    const model = new ChordModel();
    model.train([chordSequence(progressionIVviIV())]);
    const good = harmonicSimilarity(progressionIVviIV(), model);
    expect(good).toBeGreaterThan(0.5);

    const chaos = emptySeq(32);
    const rng = mulberry32(31);
    for (let t = 0; t < 32; t += 2) {
      const midi = 40 + Math.floor(rng() * 40);
      chaos[t].notes.push(note(midi, midi < 60 ? 'L' : 'R', 3, 2));
    }
    expect(harmonicSimilarity(chaos, model)).toBeLessThan(good);
  });
});
