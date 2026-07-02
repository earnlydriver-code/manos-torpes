import { describe, expect, it } from 'vitest';
import { travelCost, validateHandShape } from '../hand-physics';

// Estos tests validan el CÓDIGO PORTADO contra el comportamiento que describe la
// spec. Si algo falla, el sospechoso es el test o el port — nunca se "arregla"
// hand-physics.js.

describe('validateHandShape — mano derecha', () => {
  it('acorde C4-E4-G4 con dedos 1-3-5 es legal y cómodo (strain 0)', () => {
    const r = validateHandShape([60, 64, 67], [1, 3, 5], 'R');
    expect(r).toEqual({ legal: true, strain: 0 });
  });

  it('mano vacía es legal con strain 0', () => {
    expect(validateHandShape([], [], 'R')).toEqual({ legal: true, strain: 0 });
  });

  it('más de 5 notas es ilegal', () => {
    const r = validateHandShape([60, 62, 64, 65, 67, 69], [1, 2, 3, 4, 5, 5], 'R');
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('more_than_5_fingers');
  });

  it('dedo repetido es ilegal', () => {
    const r = validateHandShape([60, 64], [1, 1], 'R');
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('finger_reused');
  });

  it('el span se mide contra las NOTAS reales: 13 st es ilegal, 12 st es legal', () => {
    expect(validateHandShape([60, 73], [1, 5], 'R').legal).toBe(false);
    expect(validateHandShape([60, 73], [1, 5], 'R').reason).toBe('span_exceeded');
    expect(validateHandShape([60, 72], [1, 5], 'R').legal).toBe(true);
  });

  it('una sola nota siempre es legal, esté donde esté', () => {
    expect(validateHandShape([75], [2], 'R').legal).toBe(true);
  });

  it('cruce de dedos sin pulgar es ilegal (dedo 2 por encima del 3)', () => {
    const r = validateHandShape([60, 64], [3, 2], 'R');
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('finger_crossing');
  });

  it('paso de pulgar legal: pulgar hasta 3 st después del dedo 3', () => {
    expect(validateHandShape([64, 65], [3, 1], 'R').legal).toBe(true);
    expect(validateHandShape([64, 67], [3, 1], 'R').legal).toBe(true); // justo 3 st
  });

  it('paso de pulgar a 4 st es ilegal (THUMB_PASS_MAX=3)', () => {
    const r = validateHandShape([64, 68], [3, 1], 'R');
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('finger_crossing');
  });

  it('el pulgar no puede pasar bajo los dedos 4 o 5', () => {
    expect(validateHandShape([64, 66], [4, 1], 'R').legal).toBe(false);
    expect(validateHandShape([64, 66], [5, 1], 'R').legal).toBe(false);
  });

  it('strain: octava justa (12 st) con 1-5 está al límite físico (strain 1)', () => {
    const r = validateHandShape([60, 72], [1, 5], 'R');
    expect(r.legal).toBe(true);
    expect(r.strain).toBe(1);
  });

  it('strain: dedos adyacentes muy abiertos duelen (2-3 abarcando 6 st)', () => {
    const r = validateHandShape([60, 66], [2, 3], 'R');
    expect(r.legal).toBe(true);
    expect(r.strain).toBeCloseTo(0.3, 5); // 0.15 * (6 - 4)
  });
});

describe('validateHandShape — mano izquierda (el espejo, bug #1 de la spec)', () => {
  it('teclas ascendentes con dedos DESCENDENTES es legal (5-3-1)', () => {
    expect(validateHandShape([48, 52, 55], [5, 3, 1], 'L').legal).toBe(true);
  });

  it('teclas ascendentes con dedos ascendentes es ILEGAL en la izquierda (1-3-5)', () => {
    const r = validateHandShape([48, 52, 55], [1, 3, 5], 'L');
    expect(r.legal).toBe(false);
    expect(r.reason).toBe('finger_crossing');
  });

  it('paso de pulgar izquierdo espejado: legal a ≤3 st, ilegal a 4 st', () => {
    // El pulgar (en la nota aguda de la izquierda) cruza bajo el dedo 2.
    expect(validateHandShape([55, 57], [1, 2], 'L').legal).toBe(true);
    expect(validateHandShape([53, 57], [1, 2], 'L').legal).toBe(false);
  });
});

describe('travelCost (código portado: redondea a pasos ENTEROS de semicorchea)', () => {
  it('sin movimiento o dentro del rango gratis (≤2 st) cuesta 0', () => {
    expect(travelCost(60, 60)).toBe(0);
    expect(travelCost(60, 62)).toBe(0);
    expect(travelCost(62, 60)).toBe(0);
  });

  it('5 st cuesta ceil((5-2)*0.5) = 2 pasos, y es simétrico', () => {
    expect(travelCost(60, 65)).toBe(2);
    expect(travelCost(65, 60)).toBe(2);
  });

  it('una octava (12 st) cuesta 5 pasos', () => {
    expect(travelCost(60, 72)).toBe(5);
  });

  it('un salto >7 st entre beats consecutivos deja a la mano sin tocar ese beat (regla 5)', () => {
    // travelCost(8 st) = 3 pasos = casi un beat completo de semicorcheas
    expect(travelCost(60, 68)).toBe(3);
  });
});
