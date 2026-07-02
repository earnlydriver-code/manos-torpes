import { Midi } from '@tonejs/midi';
import { KBD_HI, KBD_LO, STEPS_PER_BAR } from '../engine/constants';
import { repairGenome } from '../engine/genome';
import { melodyIntervals } from '../engine/markov';
import { validateStep } from '../engine/step-validator';
import type { Finger, Genome, Hand, NoteEvent, Step } from '../types/music';

/**
 * Importa música real a nuestro mundo (Etapa 2, spec §5): cuantiza a la
 * rejilla de semicorcheas, parte en ventanas de N compases, reparte manos,
 * asigna digitación y — CLAVE — pasa todo por el FILTRO FÍSICO (repairGenome):
 * el agente no imita notas que sus manos no alcanzan; encuentra su propia
 * digitación. Lo que no cabe en manos humanas se recorta aquí.
 *
 * Cada pieza se corta en ventanas de 2, 3 Y 4 compases a la vez: así las
 * semillas existen para cualquier tamaño que elija (o sugiera) la app.
 */

export type RawNote = { midi: number; time: number; duration: number; velocity: number };

export type WindowsByBars = { 2: Genome[]; 3: Genome[]; 4: Genome[] };

export type ImportedPiece = {
  name: string;
  source: 'midi' | 'audio';
  noteCount: number;
  bpm: number; // tempo real del archivo (cabecera MIDI o estimado del audio)
  windows: Genome[]; // corte de 2 compases (compatibilidad con piezas viejas)
  windowsByBars: WindowsByBars;
  melodySeqs: number[][]; // intervalos de la voz superior (entrena el Markov)
};

const MAX_WINDOWS = 32;
// Digitaciones canónicas por número de notas (mano derecha, teclas ascendentes).
const FINGERINGS_R: Finger[][] = [[], [3], [1, 5], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5]];

/** Parsea un archivo .mid/.midi ya leído a memoria. */
export function parseMidiBuffer(name: string, data: ArrayBuffer): ImportedPiece {
  const midi = new Midi(data);
  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;
  const notes: RawNote[] = [];
  for (const track of midi.tracks) {
    if (track.channel === 9) continue; // percusión General MIDI
    for (const n of track.notes) {
      notes.push({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
    }
  }
  return importFromNotes(name, notes, bpm, 'midi');
}

function intoRange(midi: number): number {
  let m = midi;
  while (m < KBD_LO) m += 12;
  while (m > KBD_HI) m -= 12;
  return m;
}

type Quantized = { step: number; midi: number; durSteps: number; vel: number };

function cutWindows(quantized: Quantized[], totalSteps: number, bpm: number, bars: 2 | 3 | 4): Genome[] {
  const windowSize = bars * STEPS_PER_BAR;
  const windows: Genome[] = [];
  const hop = Math.max(1, Math.floor(windowSize / 2));
  for (let start = 0; start + windowSize <= totalSteps + hop; start += hop) {
    if (windows.length >= MAX_WINDOWS) break;
    const inWindow = quantized.filter((q) => q.step >= start && q.step < start + windowSize);
    if (inWindow.length < bars * 3) continue; // muy vacía: no enseña nada

    // Reparto de manos: punto de corte en la mediana de la ventana.
    const sorted = inWindow.map((q) => q.midi).sort((a, b) => a - b);
    const split = Math.max(50, Math.min(64, sorted[Math.floor(sorted.length / 2)]));

    const steps: Step[] = Array.from({ length: windowSize }, (_, i) => ({ step: i, notes: [] }));
    for (let t = 0; t < windowSize; t++) {
      const at = inWindow.filter((q) => q.step === start + t);
      for (const hand of ['L', 'R'] as const) {
        let handNotes = at.filter((q) => (hand === 'L' ? q.midi < split : q.midi >= split));
        // Duplicados de tecla (dos pistas con la misma nota): quedará la más fuerte.
        const byMidi = new Map<number, (typeof handNotes)[number]>();
        for (const q of handNotes) {
          const seen = byMidi.get(q.midi);
          if (!seen || q.vel > seen.vel) byMidi.set(q.midi, q);
        }
        handNotes = [...byMidi.values()].sort((a, b) => a.midi - b.midi);
        if (handNotes.length > 5) {
          handNotes = handNotes
            .sort((a, b) => b.vel - a.vel)
            .slice(0, 5)
            .sort((a, b) => a.midi - b.midi);
        }
        const fingering = FINGERINGS_R[handNotes.length];
        const fingers: Finger[] = hand === 'R' ? fingering : ([...fingering].reverse() as Finger[]);
        handNotes.forEach((q, i) => {
          const note: NoteEvent = {
            midi: q.midi,
            hand: hand as Hand,
            finger: fingers[i],
            durSteps: Math.min(q.durSteps, windowSize - t),
            vel: q.vel,
          };
          steps[t].notes.push(note);
        });
      }
    }

    // FILTRO FÍSICO: la spec exige que el corpus pase por las manos.
    const genome: Genome = repairGenome({
      bars,
      tempo: Math.max(60, Math.min(140, Math.round(bpm))),
      steps,
    });
    if (genome.steps.every((s) => validateStep(s.notes).legal)) {
      const onsets = genome.steps.filter((s) => s.notes.length > 0).length;
      if (onsets >= bars * 3) windows.push(genome);
    }
  }
  return windows;
}

/** Cuantiza notas crudas (de MIDI o de transcripción de audio) a ventanas legales. */
export function importFromNotes(
  name: string,
  rawNotes: RawNote[],
  bpm: number,
  source: 'midi' | 'audio',
): ImportedPiece {
  const stepSec = 60 / Math.max(30, Math.min(300, bpm)) / 4;

  // 1. Cuantizar todo a una línea de steps larga.
  let totalSteps = 0;
  const quantized: Quantized[] = [];
  for (const n of rawNotes) {
    if (n.duration <= 0) continue;
    const step = Math.max(0, Math.round(n.time / stepSec));
    const durSteps = Math.max(1, Math.round(n.duration / stepSec));
    quantized.push({
      step,
      midi: intoRange(Math.round(n.midi)),
      durSteps,
      vel: Math.max(0.2, Math.min(1, n.velocity || 0.7)),
    });
    totalSteps = Math.max(totalSteps, step + durSteps);
  }
  const roundedBpm = Math.round(bpm);
  if (quantized.length === 0) {
    return {
      name,
      source,
      noteCount: 0,
      bpm: roundedBpm,
      windows: [],
      windowsByBars: { 2: [], 3: [], 4: [] },
      melodySeqs: [],
    };
  }

  // 2. Un corte por cada tamaño de frase posible.
  const windowsByBars: WindowsByBars = {
    2: cutWindows(quantized, totalSteps, bpm, 2),
    3: cutWindows(quantized, totalSteps, bpm, 3),
    4: cutWindows(quantized, totalSteps, bpm, 4),
  };

  // 3. La melodía para el Markov sale del corte más largo disponible
  //    (contextos más ricos); si la pieza es muy corta, del que haya.
  const melodySource =
    windowsByBars[4].length > 0
      ? windowsByBars[4]
      : windowsByBars[3].length > 0
        ? windowsByBars[3]
        : windowsByBars[2];
  const melodySeqs: number[][] = [];
  for (const genome of melodySource) {
    const intervals = melodyIntervals(genome.steps);
    if (intervals.length >= 4) melodySeqs.push(intervals);
  }

  return {
    name,
    source,
    noteCount: quantized.length,
    bpm: roundedBpm,
    windows: windowsByBars[2],
    windowsByBars,
    melodySeqs,
  };
}
