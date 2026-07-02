import { describe, expect, it } from 'vitest';
import { verticalConsonance } from '../harmony';
import { emptySeq, note } from './helpers';

describe('verticalConsonance (oído vertical, Fase 6)', () => {
  it('un acorde mayor sostenido no choca: 1.0', () => {
    const seq = emptySeq(16);
    seq[0].notes.push(note(60, 'R', 1, 16), note(64, 'R', 3, 16), note(67, 'R', 5, 16));
    expect(verticalConsonance(seq)).toBe(1);
  });

  it('música monofónica no puede chocar: 1.0', () => {
    const seq = emptySeq(16);
    for (let t = 0; t < 16; t += 2) seq[t].notes.push(note(60 + t, 'R', 3, 2));
    expect(verticalConsonance(seq)).toBe(1);
  });

  it('una segunda menor SOSTENIDA en parte fuerte es el peor choque', () => {
    const seq = emptySeq(16);
    seq[0].notes.push(note(60, 'L', 1, 16), note(61, 'R', 1, 16));
    expect(verticalConsonance(seq)).toBeLessThan(0.4);
  });

  it('la misma disonancia como NOTA DE PASO breve y a contratiempo casi no cuenta', () => {
    const clashSustained = emptySeq(16);
    clashSustained[0].notes.push(note(60, 'L', 1, 16), note(61, 'R', 1, 16));

    const passing = emptySeq(16);
    passing[0].notes.push(note(60, 'L', 1, 16)); // bajo sostenido
    passing[3].notes.push(note(61, 'R', 1, 1)); // roce de 1 semicorchea fuera del pulso
    passing[4].notes.push(note(64, 'R', 2, 4)); // resuelve a consonancia

    expect(verticalConsonance(passing)).toBeGreaterThan(0.85);
    expect(verticalConsonance(passing)).toBeGreaterThan(verticalConsonance(clashSustained));
  });

  it('el choque con una nota sostenida desde antes también cuenta', () => {
    const seq = emptySeq(16);
    seq[0].notes.push(note(59, 'L', 1, 16)); // Si mantenido
    seq[8].notes.push(note(60, 'R', 1, 8)); // llega Do encima: séptima mayor/2ªm
    expect(verticalConsonance(seq)).toBeLessThan(0.7);
  });

  it('el silencio y las texturas de una sola voz por momento devuelven 1', () => {
    expect(verticalConsonance(emptySeq(16))).toBe(1);
  });
});
