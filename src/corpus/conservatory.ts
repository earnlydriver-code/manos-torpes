import type { Step } from '../types/music';
import type { RawNote } from './midi-import';

/**
 * PIANISTA DE CONSERVATORIO (trasplante Magenta, decidido con el Usuario tras
 * la conversación honesta sobre los techos del proyecto): melody_rnn de
 * Google Magenta — una red entrenada con corpus masivos de melodías reales —
 * CONTINÚA las melodías de tu corpus. Gratis (Apache 2.0), checkpoint alojado
 * por Google (~16 MB, una vez), corre 100% en tu navegador.
 *
 * El reparto de papeles no cambia: el conservatorio propone frases con oficio,
 * el filtro físico las adapta a manos torpes, tu gusto juzga.
 */

const CHECKPOINT =
  'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn';
const PRIMER_STEPS = 16; // 1 compás de arranque
const CONTINUE_STEPS = 32; // 2 compases de continuación

export type MagentaNote = {
  pitch: number;
  quantizedStartStep: number;
  quantizedEndStep: number;
};

/**
 * Primer monofónico: la voz superior de la mano derecha del primer compás.
 * melody_rnn es melódica pura — sin acordes ni solapes (cada nota termina
 * donde empieza la siguiente).
 */
export function buildPrimer(steps: Step[]): MagentaNote[] {
  const onsets: Array<{ start: number; pitch: number; dur: number }> = [];
  for (const s of steps) {
    if (s.step >= PRIMER_STEPS) break;
    const right = s.notes.filter((n) => n.hand === 'R');
    if (right.length === 0) continue;
    const top = right.reduce((a, b) => (b.midi > a.midi ? b : a));
    onsets.push({ start: s.step, pitch: top.midi, dur: top.durSteps });
  }
  return onsets.map((o, i) => {
    const nextStart = onsets[i + 1]?.start ?? PRIMER_STEPS;
    return {
      pitch: o.pitch,
      quantizedStartStep: o.start,
      quantizedEndStep: Math.min(o.start + o.dur, nextStart, PRIMER_STEPS),
    };
  });
}

/** Primer + continuación (desplazada) → notas crudas en segundos reales. */
export function mergeToRaw(
  primer: MagentaNote[],
  continuation: MagentaNote[],
  tempo: number,
): RawNote[] {
  const stepSec = 60 / tempo / 4;
  const all = [
    ...primer,
    ...continuation.map((n) => ({
      pitch: n.pitch,
      quantizedStartStep: n.quantizedStartStep + PRIMER_STEPS,
      quantizedEndStep: n.quantizedEndStep + PRIMER_STEPS,
    })),
  ];
  return all
    .filter((n) => n.quantizedEndStep > n.quantizedStartStep)
    .map((n) => ({
      midi: n.pitch,
      time: n.quantizedStartStep * stepSec,
      duration: (n.quantizedEndStep - n.quantizedStartStep) * stepSec,
      velocity: 0.8,
    }));
}

type MusicRnnInstance = {
  initialize(): Promise<void>;
  continueSequence(
    seq: unknown,
    steps: number,
    temperature: number,
  ): Promise<{ notes: MagentaNote[] }>;
};

let modelPromise: Promise<MusicRnnInstance> | null = null;

function loadModel(): Promise<MusicRnnInstance> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { MusicRNN } = await import('@magenta/music/es6/music_rnn');
      const rnn = new MusicRNN(CHECKPOINT) as unknown as MusicRnnInstance;
      await rnn.initialize();
      return rnn;
    })().catch((err) => {
      modelPromise = null; // el próximo intento vuelve a cargar
      throw err;
    });
  }
  return modelPromise;
}

/**
 * Continúa la melodía del material dado (un compás de primer → dos de
 * continuación) y devuelve la frase completa como notas crudas para el
 * pipeline físico. `temperature` alta = más aventurada.
 */
export async function conservatoryPhrase(
  sourceSteps: Step[],
  tempo: number,
  temperature = 1.05,
): Promise<RawNote[]> {
  const primer = buildPrimer(sourceSteps);
  if (primer.length < 3) {
    throw new Error('el material de arranque tiene muy poca melodía en la mano derecha');
  }
  const rnn = await loadModel();
  const result = await rnn.continueSequence(
    {
      notes: primer,
      quantizationInfo: { stepsPerQuarter: 4 },
      totalQuantizedSteps: PRIMER_STEPS,
    },
    CONTINUE_STEPS,
    temperature,
  );
  return mergeToRaw(primer, result.notes ?? [], tempo);
}
