import { describe, expect, it } from 'vitest';
import type { TrainConfig } from '../../types/music';
import { DEFAULT_WEIGHTS } from '../constants';
import { GeneticTrainer } from '../genetic';
import { cloneGenome, repairGenome } from '../genome';
import { validateStep } from '../step-validator';

const cfg: TrainConfig = {
  bars: 2,
  tempo: 100,
  populationSize: 64,
  elitism: 6,
  tournamentK: 3,
  crossoverProb: 0.7,
  weights: DEFAULT_WEIGHTS,
  seed: 424242,
};

describe('GeneticTrainer — smoke', () => {
  it('200 generaciones mejoran el best en ≥ 0.1 y el mejor genoma sigue siendo legal', () => {
    const trainer = new GeneticTrainer(cfg);
    const initial = trainer.stats().best;
    let final = initial;
    for (let g = 0; g < 200; g++) final = trainer.stepGeneration().best;
    expect(final).toBeGreaterThan(initial + 0.1);

    const best = trainer.getBest();
    for (const s of best.genome.steps) expect(validateStep(s.notes).legal).toBe(true);
  });

  it('el elitismo hace que la curva best nunca baje', () => {
    const trainer = new GeneticTrainer({ ...cfg, seed: 777 });
    let prev = -Infinity;
    for (let g = 0; g < 50; g++) {
      const { best } = trainer.stepGeneration();
      expect(best).toBeGreaterThanOrEqual(prev);
      prev = best;
    }
  });

  it('es reproducible: misma semilla ⇒ misma curva', () => {
    const a = new GeneticTrainer({ ...cfg, seed: 12345 });
    const b = new GeneticTrainer({ ...cfg, seed: 12345 });
    for (let g = 0; g < 20; g++) {
      expect(a.stepGeneration().best).toBe(b.stepGeneration().best);
    }
  });

  it('arranque en caliente: la primera semilla entra intacta (el mejor de gen 0 ≥ su fitness)', () => {
    // Entrenamos una corrida corta y usamos su mejor como semilla de otra.
    const first = new GeneticTrainer({ ...cfg, seed: 1010 });
    for (let g = 0; g < 100; g++) first.stepGeneration();
    const learned = first.getBest();

    const warm = new GeneticTrainer({ ...cfg, seed: 2020, seedGenomes: [learned.genome] });
    expect(warm.stats().best).toBeGreaterThanOrEqual(learned.fitness - 1e-9);

    const cold = new GeneticTrainer({ ...cfg, seed: 2020 });
    expect(warm.stats().best).toBeGreaterThan(cold.stats().best);
  });

  it('las semillas con compases distintos se ignoran sin romper nada', () => {
    const donor = new GeneticTrainer({ ...cfg, bars: 3, seed: 33 });
    const warm = new GeneticTrainer({ ...cfg, bars: 2, seed: 44, seedGenomes: [donor.getBest().genome] });
    for (const ind of [warm.getBest()]) expect(ind.genome.bars).toBe(2);
    warm.stepGeneration(); // smoke: no explota
  });

  it('invariante físico: el mejor tras 100 gens es un punto fijo de repairGenome', () => {
    const trainer = new GeneticTrainer({ ...cfg, seed: 2468 });
    for (let g = 0; g < 100; g++) trainer.stepGeneration();
    const { genome } = trainer.getBest();
    const repaired = repairGenome(cloneGenome(genome));
    // Si repair cambiara algo, el genoma contenía física imposible (sostenidos
    // que no caben en la mano o teletransportes) que la evolución explotó.
    expect(JSON.stringify(repaired)).toBe(JSON.stringify(genome));
  });
});
