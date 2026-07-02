import { describe, expect, it } from 'vitest';
import type { TrainConfig } from '../../types/music';
import { DEFAULT_WEIGHTS } from '../constants';
import { GeneticTrainer } from '../genetic';
import { randomGenome } from '../genome';
import { MarkovModel } from '../markov';
import { extractRhythms } from '../rhythm';
import { mulberry32 } from '../rng';
import { composeSong } from '../song';
import { validateStep } from '../step-validator';
import { emptySeq, note } from './helpers';

function corpusWindow() {
  // Compás con figura clara: corcheas en la derecha, blancas en la izquierda.
  const steps = emptySeq(32);
  for (let bar = 0; bar < 2; bar++) {
    const base = bar * 16;
    [0, 2, 4, 6, 8, 10, 12, 14].forEach((offset, i) => {
      steps[base + offset].notes.push(note(64 + (i % 5), 'R', 3, 2));
    });
    steps[base].notes.push(note(48, 'L', 5, 8));
    steps[base + 8].notes.push(note(43, 'L', 5, 8));
  }
  return { bars: 2, tempo: 80, steps };
}

describe('extractRhythms (el ritmo también se aprende)', () => {
  it('extrae la figura de corcheas de la derecha y las blancas de la izquierda', () => {
    const bank = extractRhythms([corpusWindow()]);
    expect(bank.R.length).toBeGreaterThan(0);
    expect(bank.L.length).toBeGreaterThan(0);
    expect(bank.R[0].map(([s]) => s)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(bank.L[0].map(([s]) => s)).toEqual([0, 8]);
  });

  it('sin ventanas devuelve bancos vacíos sin explotar', () => {
    const bank = extractRhythms([]);
    expect(bank.R).toEqual([]);
    expect(bank.L).toEqual([]);
  });
});

describe('GeneticTrainer con banco rítmico', () => {
  it('entrena legal y determinista con el mutador de ritmo activo', () => {
    const melody = new MarkovModel(3);
    melody.train([[2, 2, 1, -1, -2, 4, -2, -2]]);
    const cfg: TrainConfig = {
      bars: 2,
      tempo: 80,
      populationSize: 32,
      elitism: 4,
      tournamentK: 3,
      crossoverProb: 0.7,
      weights: DEFAULT_WEIGHTS,
      seed: 4321,
      corpus: {
        model: melody.toJSON(),
        alpha: 0.35,
        rhythms: extractRhythms([corpusWindow()]),
      },
    };
    const a = new GeneticTrainer(cfg);
    const b = new GeneticTrainer(cfg);
    for (let g = 0; g < 40; g++) expect(a.stepGeneration().best).toBe(b.stepGeneration().best);
    for (const s of a.getBest().genome.steps) expect(validateStep(s.notes).legal).toBe(true);
  });
});

describe('composeSong (modo canción: A-A\'-B-A\'\' + coda)', () => {
  it('produce una pieza larga, legal, renumerada y que termina resolviendo', () => {
    const rng = mulberry32(2026);
    const base = randomGenome(rng, { bars: 2, tempo: 90 });
    const song = composeSong(mulberry32(7), base);

    expect(song.bars).toBe(9); // 4 secciones × 2 compases + 1 de coda
    expect(song.steps.length).toBe(9 * 16);
    expect(song.tempo).toBe(90);
    song.steps.forEach((s, i) => expect(s.step).toBe(i));
    for (const s of song.steps) expect(validateStep(s.notes).legal).toBe(true);

    // La sección A es el tema tal cual (los primeros compases coinciden en alturas).
    const midisAt = (steps: typeof song.steps, t: number) =>
      steps[t].notes.map((n) => n.midi).sort((a, b) => a - b);
    let matches = 0;
    let total = 0;
    for (let t = 0; t < 32; t++) {
      if (base.steps[t].notes.length === 0) continue;
      total++;
      if (JSON.stringify(midisAt(song.steps, t)) === JSON.stringify(midisAt(base.steps, t)))
        matches++;
    }
    // repairGenome puede truncar algún sostenido en la costura, pero el tema se conserva.
    if (total > 0) expect(matches / total).toBeGreaterThan(0.7);

    // Coda: el último compás tiene notas largas (la pieza respira al final).
    const coda = song.steps.slice(8 * 16);
    const codaNotes = coda.flatMap((s) => s.notes);
    expect(codaNotes.length).toBeGreaterThan(0);
    expect(Math.max(...codaNotes.map((n) => n.durSteps))).toBeGreaterThanOrEqual(8);
  });

  it('es determinista con la misma semilla', () => {
    const base = randomGenome(mulberry32(1), { bars: 2, tempo: 80 });
    const a = composeSong(mulberry32(99), base);
    const b = composeSong(mulberry32(99), base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
