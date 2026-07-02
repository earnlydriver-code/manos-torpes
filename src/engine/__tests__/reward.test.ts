import { describe, expect, it } from 'vitest';
import type { Finger, Step } from '../../types/music';
import { musicalReward } from '../reward';
import { mulberry32, randInt } from '../rng';
import type { Rng } from '../rng';
import { emptySeq, note } from './helpers';

// Tests anti-trampa: las 3 defensas de la spec §9.2. Todo agente de RL encuentra
// el exploit de la métrica antes que la música — cada exploit observado en demos
// debe convertirse en un test aquí.

function scaleGenomeSteps(): Step[] {
  const seq = emptySeq(32);
  const up = [60, 62, 64, 65, 67, 69, 71, 72];
  const melody = [...up, ...[...up].reverse()];
  melody.forEach((midi, i) => {
    seq[i * 2].notes.push(note(midi, 'R', 3, 2, 0.8));
  });
  seq[0].notes.push(note(48, 'L', 1, 4, 0.7));
  seq[16].notes.push(note(48, 'L', 1, 4, 0.7));
  return seq;
}

function noiseGenomeSteps(rng: Rng): Step[] {
  const seq = emptySeq(32);
  for (let t = 0; t < 32; t++) {
    if (rng() < 0.5) {
      const midi = randInt(rng, 36, 96);
      seq[t].notes.push(
        note(midi, midi < 60 ? 'L' : 'R', randInt(rng, 1, 5) as Finger, 1, 0.4 + rng() * 0.6),
      );
    }
  }
  return seq;
}

describe('musicalReward — defensas anti-trampa', () => {
  it('el silencio total vale exactamente -1 (no es una estrategia)', () => {
    expect(musicalReward(emptySeq(32))).toBe(-1);
  });

  it('repetir UNA nota consonante para siempre puntúa mal (defensa de entropía)', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t++) seq[t].notes.push(note(60, 'R', 1));
    const r = musicalReward(seq);
    expect(r).toBe(-0.5); // entropía 0 ⇒ castigo suave exacto de la spec
    expect(r).toBeLessThan(musicalReward(scaleGenomeSteps()));
  });

  it('dos notas alternadas también suspenden la defensa de entropía (<1.2 bits)', () => {
    const seq = emptySeq(32);
    for (let t = 0; t < 32; t++) seq[t].notes.push(note(t % 2 === 0 ? 60 : 67, 'R', t % 2 === 0 ? 1 : 5));
    const r = musicalReward(seq);
    expect(r).toBeLessThan(-0.25); // -0.5 + 1.0*0.2 = -0.3
    expect(r).toBeGreaterThanOrEqual(-0.5); // castigo suave, no acantilado
  });

  it('una escala con pulso supera a 20 genomas de ruido legal con margen ≥ 0.1', () => {
    const scaleReward = musicalReward(scaleGenomeSteps());
    let worstEnemy = -Infinity;
    for (let seed = 1; seed <= 20; seed++) {
      const noise = musicalReward(noiseGenomeSteps(mulberry32(seed * 7919)));
      worstEnemy = Math.max(worstEnemy, noise);
    }
    expect(scaleReward).toBeGreaterThan(worstEnemy + 0.1);
  });

  it('la recompensa de la escala es claramente positiva (sanity check de calibración)', () => {
    expect(musicalReward(scaleGenomeSteps())).toBeGreaterThan(0.4);
  });
});
