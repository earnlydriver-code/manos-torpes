import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { importFromNotes, parseMidiBuffer } from '../../corpus/midi-import';
import type { RawNote } from '../../corpus/midi-import';
import { validateStep } from '../step-validator';

/** Una escala de Do mayor en negras + bajo en blancas, 8 compases a 120 BPM. */
function scaleNotes(): RawNote[] {
  const notes: RawNote[] = [];
  const beat = 0.5; // 120 BPM
  const melody = [60, 62, 64, 65, 67, 69, 71, 72];
  for (let bar = 0; bar < 8; bar++) {
    for (let i = 0; i < 4; i++) {
      const midi = melody[(bar * 4 + i) % melody.length];
      notes.push({ midi, time: (bar * 4 + i) * beat, duration: beat * 0.9, velocity: 0.8 });
    }
    notes.push({ midi: 48, time: bar * 4 * beat, duration: beat * 2, velocity: 0.7 });
    notes.push({ midi: 43, time: (bar * 4 + 2) * beat, duration: beat * 2, velocity: 0.7 });
  }
  return notes;
}

describe('importFromNotes (cuantización + filtro físico)', () => {
  it('produce ventanas 100% legales con manos repartidas y melodía extraída', () => {
    const piece = importFromNotes('escala', scaleNotes(), 120, 2, 'midi');
    expect(piece.windows.length).toBeGreaterThan(0);
    expect(piece.melodySeqs.length).toBeGreaterThan(0);
    for (const genome of piece.windows) {
      expect(genome.steps.length).toBe(32);
      expect(genome.tempo).toBe(120);
      for (const s of genome.steps) {
        expect(validateStep(s.notes).legal).toBe(true);
        for (const n of s.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(36);
          expect(n.midi).toBeLessThanOrEqual(96);
        }
      }
      // Reparto de manos: el bajo quedó en la izquierda, la melodía en la derecha.
      const hands = new Set(genome.steps.flatMap((s) => s.notes.map((n) => n.hand)));
      expect(hands.has('L')).toBe(true);
      expect(hands.has('R')).toBe(true);
    }
    // La melodía por grados domina los intervalos extraídos.
    const stepIntervals = piece.melodySeqs.flat().filter((iv) => Math.abs(iv) <= 2).length;
    expect(stepIntervals / piece.melodySeqs.flat().length).toBeGreaterThan(0.5);
  });

  it('notas fuera del teclado se transponen por octavas al rango 36-96', () => {
    const wild: RawNote[] = Array.from({ length: 16 }, (_, i) => ({
      midi: i % 2 === 0 ? 20 : 110, // fuera por abajo y por arriba
      time: i * 0.25,
      duration: 0.2,
      velocity: 0.8,
    }));
    const piece = importFromNotes('extremos', wild, 120, 2, 'midi');
    for (const g of piece.windows)
      for (const s of g.steps)
        for (const n of s.notes) {
          expect(n.midi).toBeGreaterThanOrEqual(36);
          expect(n.midi).toBeLessThanOrEqual(96);
        }
  });

  it('un archivo MIDI real (round-trip @tonejs/midi) se importa entero', () => {
    const midi = new Midi();
    midi.header.setTempo(100);
    const track = midi.addTrack();
    for (const n of scaleNotes()) {
      track.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
    }
    const bytes = midi.toArray();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const piece = parseMidiBuffer('roundtrip.mid', buffer as ArrayBuffer, 2);
    expect(piece.noteCount).toBeGreaterThan(0);
    expect(piece.windows.length).toBeGreaterThan(0);
  });

  it('sin notas devuelve una pieza vacía sin explotar', () => {
    const piece = importFromNotes('vacía', [], 120, 2, 'midi');
    expect(piece.windows).toEqual([]);
    expect(piece.noteCount).toBe(0);
  });
});
