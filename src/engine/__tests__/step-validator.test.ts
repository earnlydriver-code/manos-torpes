import { describe, expect, it } from 'vitest';
import { validateStep } from '../step-validator';
import { note } from './helpers';

describe('validateStep — reglas entre manos (spec §3, reglas 1 y 4)', () => {
  it('acorde legal en ambas manos pasa', () => {
    const r = validateStep([
      note(48, 'L', 5),
      note(52, 'L', 3),
      note(55, 'L', 1),
      note(72, 'R', 1),
      note(76, 'R', 3),
      note(79, 'R', 5),
    ]);
    expect(r.legal).toBe(true);
  });

  it('10 notas simultáneas legales pasan (5 por mano)', () => {
    const r = validateStep([
      note(48, 'L', 5),
      note(50, 'L', 4),
      note(52, 'L', 3),
      note(53, 'L', 2),
      note(55, 'L', 1),
      note(72, 'R', 1),
      note(74, 'R', 2),
      note(76, 'R', 3),
      note(77, 'R', 4),
      note(79, 'R', 5),
    ]);
    expect(r.legal).toBe(true);
  });

  it('más de 10 notas es ilegal', () => {
    const eleven = [
      note(48, 'L', 5),
      note(50, 'L', 4),
      note(52, 'L', 3),
      note(53, 'L', 2),
      note(55, 'L', 1),
      note(72, 'R', 1),
      note(74, 'R', 2),
      note(76, 'R', 3),
      note(77, 'R', 4),
      note(79, 'R', 5),
      note(81, 'R', 5),
    ];
    const r = validateStep(eleven);
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('more_than_10_notes');
  });

  it('la misma tecla dos veces en una mano es ilegal (un dedo, una tecla)', () => {
    const r = validateStep([note(60, 'R', 1), note(60, 'R', 2)]);
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('key_reused');
  });

  it('manos atravesadas más allá de la tolerancia (3 st) es ilegal', () => {
    const r = validateStep([note(70, 'L', 1), note(65, 'R', 1)]);
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('hands_crossed');
  });

  it('cruce dentro de la tolerancia de 3 st es legal (como pianistas reales)', () => {
    const r = validateStep([note(67, 'L', 1), note(65, 'R', 1)]);
    expect(r.legal).toBe(true);
  });

  it('una mano ilegal contamina el step (delega en validateHandShape)', () => {
    const r = validateStep([note(60, 'R', 3), note(64, 'R', 2)]);
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('finger_crossing');
  });
});
