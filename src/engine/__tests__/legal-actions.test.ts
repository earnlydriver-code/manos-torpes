import { describe, expect, it } from 'vitest';
import { initialHandsState, moveAnchor, sampleHandAction, sampleStepNotes } from '../legal-actions';
import { randomGenome, repairGenome } from '../genome';
import { travelCost } from '../hand-physics';
import { mulberry32 } from '../rng';
import { validateStep } from '../step-validator';

describe('muestreo constructivo de acciones legales', () => {
  it('propiedad: 1000 steps muestreados pasan validateStep sin excepción', () => {
    const rng = mulberry32(2026);
    const hands = initialHandsState(rng);
    let nonEmpty = 0;
    for (let t = 0; t < 1000; t++) {
      const notes = sampleStepNotes(rng, hands, t, 1000);
      expect(validateStep(notes).legal).toBe(true);
      if (notes.length > 0) nonEmpty++;
    }
    // El cinturón-y-tirantes casi nunca debe activarse: el sampler es productivo.
    expect(nonEmpty).toBeGreaterThan(300);
  });

  it('la regla de viaje se consulta ANTES de tocar: mano en viaje emite silencio', () => {
    const rng = mulberry32(7);
    const hands = initialHandsState(rng);
    const step = 4;
    // Salto de 9 st: travelCost = ceil((9-2)*0.5) = 4 pasos en viaje.
    const from = hands.R.anchor;
    moveAnchor(hands.R, from + 9, step);
    expect(hands.R.travelingUntilStep).toBe(step + travelCost(from, from + 9));
    for (let t = step; t < hands.R.travelingUntilStep; t++) {
      expect(sampleHandAction(rng, hands, 'R', t, 64, [])).toEqual([]);
    }
  });

  it('un salto pequeño (≤2 st) es gratis: la mano sigue disponible', () => {
    const rng = mulberry32(11);
    const hands = initialHandsState(rng);
    moveAnchor(hands.L, hands.L.anchor + 2, 8);
    expect(hands.L.travelingUntilStep).toBe(0);
  });
});

describe('randomGenome', () => {
  it('100 genomas con semilla: todos los steps legales, midis en rango, longitud correcta', () => {
    const rng = mulberry32(31337);
    for (let i = 0; i < 100; i++) {
      const g = randomGenome(rng, { bars: 2, tempo: 100 });
      expect(g.steps.length).toBe(32);
      for (const s of g.steps) {
        expect(validateStep(s.notes).legal).toBe(true);
        for (const n of s.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(36);
          expect(n.midi).toBeLessThanOrEqual(96);
          expect(n.durSteps).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

describe('repairGenome', () => {
  it('elimina teletransportes: una mano no puede saltar 2 octavas entre semicorcheas', () => {
    const rng = mulberry32(99);
    const g = randomGenome(rng, { bars: 2, tempo: 100 });
    // Inyectamos un teletransporte ilegal a mano: nota en step 0 y salto de 24 st en step 1.
    g.steps[0].notes = [{ midi: 48, hand: 'L', finger: 1, durSteps: 1, vel: 0.8 }];
    g.steps[1].notes = [{ midi: 72, hand: 'L', finger: 1, durSteps: 1, vel: 0.8 }];
    repairGenome(g);
    expect(g.steps[1].notes.filter((n) => n.hand === 'L')).toEqual([]);
  });

  it('repara steps ilegales quitando la nota de menor vel', () => {
    const rng = mulberry32(100);
    const g = randomGenome(rng, { bars: 2, tempo: 100 });
    // Cruce de dedos ilegal inyectado: dedo 3 bajo el 2 en mano derecha.
    g.steps[0].notes = [
      { midi: 60, hand: 'R', finger: 3, durSteps: 1, vel: 0.9 },
      { midi: 64, hand: 'R', finger: 2, durSteps: 1, vel: 0.3 },
    ];
    repairGenome(g);
    expect(validateStep(g.steps[0].notes).legal).toBe(true);
    expect(g.steps[0].notes.length).toBe(1);
    expect(g.steps[0].notes[0].vel).toBe(0.9); // sobrevive la de mayor vel
  });
});
