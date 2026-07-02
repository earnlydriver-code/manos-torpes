import type { Finger, Genome, Hand, NoteEvent, RhythmBank, TrainConfig } from '../types/music';
import { ChordModel, detectChordSegments, detectKeyRoot, SEGMENT_STEPS } from './chords';
import { KBD_HI, KBD_LO, STEPS_PER_BAR } from './constants';
import { blendedReward } from './corpus-blend';
import { allNotes, cloneGenome, randomGenome, repairGenome } from './genome';
import { verticalConsonance } from './harmony';
import { LstmModel } from './lstm';
import { MarkovModel, melodyIntervals } from './markov';
import { musicalReward } from './reward';
import { detectScaleKrumhansl, scaleInfo } from './reward-helpers';
import type { Rng } from './rng';
import { mulberry32, pick, randInt, weightedPick } from './rng';

/**
 * Algoritmo genético de la Etapa 1 ("Bebé"): curiosidad pura sobre la
 * recompensa heurística. Sin I/O — corre igual en el worker y en los tests.
 * Invariante: tras cada generación, toda la población es físicamente legal
 * (construcción legal + repairGenome tras cada operador).
 */

type Individual = { genome: Genome; fitness: number };
export type GenStats = { gen: number; best: number; avg: number };

/**
 * Peso del oído vertical en el fitness (0 = como la spec pura).
 * 0.3 → 0.45 el 2026-07-02: el Usuario seguía oyendo disonancia tras la
 * mejora 1/4; la música real puntúa ~0.95 así que apenas la roza.
 */
const HARMONY_WEIGHT = 0.45;

/** Compositor de frases: la LSTM (contexto 16) o el Markov (contexto=orden). */
type PhraseSampler = { sample(rng: Rng, context: number[]): number; readonly contextLen: number };

function clampMidi(midi: number): number {
  return Math.max(KBD_LO, Math.min(KBD_HI, midi));
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Escala detectada del propio genoma (la misma que usa la defensa 3 del reward). */
function genomeScale(g: Genome): Set<number> {
  return detectScaleKrumhansl(g.steps.flatMap((s) => s.notes.map((n) => n.midi)));
}

/** La siguiente tecla en la dirección dada que cae dentro de la escala. */
function nextInScale(midi: number, dir: -1 | 1, scale: Set<number>): number {
  let m = midi;
  for (let i = 0; i < 12; i++) {
    m += dir;
    if (scale.has(pitchClass(m))) break;
  }
  return m;
}

/** Transposición DIATÓNICA: mueve `degrees` grados de la escala, no semitonos. */
function shiftDiatonic(midi: number, degrees: number, scale: Set<number>): number {
  const dir: -1 | 1 = degrees > 0 ? 1 : -1;
  let m = midi;
  for (let k = 0; k < Math.abs(degrees); k++) m = nextInScale(m, dir, scale);
  return m;
}

/** Reasigna dedos canónicos a las notas de una mano en un step (asc en R, espejo en L). */
function reassignFingers(rng: Rng, handNotes: NoteEvent[], side: Hand): void {
  if (handNotes.length === 0 || handNotes.length > 5) return;
  const sorted = [...handNotes].sort((a, b) => a.midi - b.midi);
  const chosen = new Set<number>();
  while (chosen.size < sorted.length) chosen.add(randInt(rng, 1, 5));
  const ascending = [...chosen].sort((a, b) => a - b);
  const fingers = side === 'R' ? ascending : [...ascending].reverse();
  sorted.forEach((n, i) => {
    n.finger = fingers[i] as Finger;
  });
}

type Mutator = (rng: Rng, g: Genome) => void;

const mutatePitch: Mutator = (rng, g) => {
  const notes = allNotes(g);
  if (notes.length === 0) return;
  const { stepIndex, note } = pick(rng, notes);
  const dir: -1 | 1 = rng() < 0.5 ? -1 : 1;
  // La mayoría de las veces, un paso por grados de la escala detectada del
  // propio genoma (movimiento melódico); a veces, cromático puro (exploración).
  if (rng() < 0.65) {
    note.midi = clampMidi(nextInScale(note.midi, dir, genomeScale(g)));
  } else {
    note.midi = clampMidi(note.midi + dir * randInt(rng, 1, 4));
  }
  reassignFingers(rng, g.steps[stepIndex].notes.filter((n) => n.hand === note.hand), note.hand);
};

/** Acerca una nota fuera de escala a la escala detectada (el reward hará el resto). */
const mutateSnapToScale: Mutator = (rng, g) => {
  const scale = genomeScale(g);
  const offenders = allNotes(g).filter((x) => !scale.has(pitchClass(x.note.midi)));
  if (offenders.length === 0) return;
  const { stepIndex, note } = pick(rng, offenders);
  const dir: -1 | 1 = rng() < 0.5 ? -1 : 1;
  note.midi = clampMidi(nextInScale(note.midi, dir, scale));
  reassignFingers(rng, g.steps[stepIndex].notes.filter((n) => n.hand === note.hand), note.hand);
};

const mutateShift: Mutator = (rng, g) => {
  const notes = allNotes(g);
  if (notes.length === 0) return;
  const { stepIndex, note } = pick(rng, notes);
  const target = stepIndex + (rng() < 0.5 ? -1 : 1);
  if (target < 0 || target >= g.steps.length) return;
  g.steps[stepIndex].notes = g.steps[stepIndex].notes.filter((n) => n !== note);
  g.steps[target].notes.push(note);
  note.durSteps = Math.min(note.durSteps, g.steps.length - target);
  reassignFingers(rng, g.steps[target].notes.filter((n) => n.hand === note.hand), note.hand);
};

const mutateAddNote: Mutator = (rng, g) => {
  const anyStep = randInt(rng, 0, g.steps.length - 1);
  // Preferir el beat: los onsets en la rejilla refuerzan el pulso que mide el reward.
  const t = rng() < 0.6 ? anyStep - (anyStep % 4) : anyStep;
  const hand: Hand = rng() < 0.5 ? 'L' : 'R';
  const handNotes = g.steps[t].notes.filter((n) => n.hand === hand);
  if (handNotes.length >= 5) return;
  const allMidis = g.steps.flatMap((s) => s.notes.map((n) => n.midi));
  let midi: number;
  if (rng() < 0.5 && allMidis.length > 0) {
    // Ancla tonal: tónica o quinta de la escala detectada, en el registro de la
    // mano. Construye la jerarquía tonal que hace la escala reconocible al oído.
    const { root } = scaleInfo(allMidis);
    const pc = rng() < 0.6 ? root : (root + 7) % 12;
    const center = hand === 'L' ? 50 : 74;
    midi = clampMidi(pc + 12 * Math.round((center - pc) / 12));
  } else {
    const anyNote = allNotes(g).filter((x) => x.note.hand === hand);
    const base =
      handNotes.length > 0
        ? pick(rng, handNotes).midi
        : anyNote.length > 0
          ? pick(rng, anyNote).note.midi
          : hand === 'L'
            ? randInt(rng, 45, 60)
            : randInt(rng, 60, 84);
    midi = clampMidi(base + randInt(rng, -5, 5));
  }
  if (handNotes.some((n) => n.midi === midi)) return;
  g.steps[t].notes.push({
    midi,
    hand,
    finger: 3,
    durSteps: Math.min(weightedPick(rng, [[1, 0.5], [2, 0.3], [4, 0.2]] as const), g.steps.length - t),
    vel: 0.4 + 0.6 * rng(),
  });
  reassignFingers(rng, g.steps[t].notes.filter((n) => n.hand === hand), hand);
};

const mutateRemoveNote: Mutator = (rng, g) => {
  const notes = allNotes(g);
  if (notes.length === 0) return;
  const { stepIndex, note } = pick(rng, notes);
  g.steps[stepIndex].notes = g.steps[stepIndex].notes.filter((n) => n !== note);
};

const mutateDuration: Mutator = (rng, g) => {
  const notes = allNotes(g);
  if (notes.length === 0) return;
  const { stepIndex, note } = pick(rng, notes);
  const delta = pick(rng, [-2, -1, 1, 2]);
  note.durSteps = Math.max(1, Math.min(note.durSteps + delta, g.steps.length - stepIndex));
};

/**
 * Reubica una mano entera dentro de un compás. Prefiere octavas y quintas:
 * cambia el registro sin ensuciar la tonalidad del genoma.
 */
const mutateTransposeHand: Mutator = (rng, g) => {
  const hand: Hand = rng() < 0.5 ? 'L' : 'R';
  const bar = randInt(rng, 0, g.bars - 1);
  const delta = pick(rng, [-12, -12, -7, -5, 5, 7, 12, 12]);
  for (let t = bar * STEPS_PER_BAR; t < (bar + 1) * STEPS_PER_BAR; t++) {
    for (const n of g.steps[t].notes) if (n.hand === hand) n.midi = clampMidi(n.midi + delta);
  }
};

/**
 * Copia un compás sobre otro CON variación (transposición): el motor directo
 * de la recompensa de estructura "repetición variada, no literal".
 */
const mutateCopyBar: Mutator = (rng, g) => {
  if (g.bars < 2) return;
  const scale = genomeScale(g);
  const src = randInt(rng, 0, g.bars - 1);
  let dst = randInt(rng, 0, g.bars - 1);
  if (dst === src) dst = (src + 1) % g.bars;
  // Transposición DIATÓNICA de ±1-2 grados (sugerencia de la spec): la variación
  // queda dentro de la tonalidad del genoma, alimentando "repetición variada".
  const degrees = pick(rng, [-2, -1, 1, 2]);
  for (let offset = 0; offset < STEPS_PER_BAR; offset++) {
    const from = g.steps[src * STEPS_PER_BAR + offset];
    const to = g.steps[dst * STEPS_PER_BAR + offset];
    to.notes = from.notes.map((n) => ({
      ...n,
      midi: clampMidi(shiftDiatonic(n.midi, degrees, scale)),
      durSteps: Math.min(n.durSteps, g.steps.length - to.step),
    }));
  }
};

const MUTATORS: ReadonlyArray<readonly [Mutator, number]> = [
  [mutatePitch, 0.25],
  [mutateCopyBar, 0.15],
  [mutateAddNote, 0.13],
  [mutateShift, 0.12],
  [mutateSnapToScale, 0.1],
  [mutateRemoveNote, 0.1],
  [mutateDuration, 0.08],
  [mutateTransposeHand, 0.07],
];

/**
 * Mutador armónico (mejora 1/4): pone a la MANO IZQUIERDA a acompañar — elige
 * el acorde del siguiente medio compás muestreando las progresiones del
 * corpus y acerca las notas graves existentes a las notas de ese acorde
 * (conserva el ritmo; solo cambia QUÉ notas pisa la izquierda).
 */
function makeChordAccompaniment(model: ChordModel): Mutator {
  return (rng, g) => {
    const keyRoot = detectKeyRoot(g.steps);
    const segments = detectChordSegments(g.steps, keyRoot);
    if (segments.length === 0) return;
    const segIndex = randInt(rng, 0, segments.length - 1);
    const prev = segIndex > 0 ? segments[segIndex - 1].symbol : segments[segIndex].symbol;
    const target = model.sample(rng, prev);
    if (target === 'N') return;
    const degree = parseInt(target, 10);
    const quality = target.endsWith('m') ? 'm' : 'M';
    const root = (keyRoot + degree) % 12;
    const tones = [root, (root + (quality === 'm' ? 3 : 4)) % 12, (root + 7) % 12];

    const from = segIndex * SEGMENT_STEPS;
    const to = from + SEGMENT_STEPS;
    for (let t = from; t < to && t < g.steps.length; t++) {
      const left = g.steps[t].notes.filter((n) => n.hand === 'L');
      if (left.length === 0) continue;
      for (const n of left) {
        // La nota del acorde más cercana en su propio registro.
        let bestMidi = n.midi;
        let bestDist = Infinity;
        for (const pc of tones) {
          for (let oct = -1; oct <= 1; oct++) {
            const candidate = n.midi - (((n.midi % 12) - pc + 12) % 12) + oct * 12;
            const dist = Math.abs(candidate - n.midi);
            if (dist < bestDist && candidate >= KBD_LO && candidate <= KBD_HI) {
              bestDist = dist;
              bestMidi = candidate;
            }
          }
        }
        n.midi = bestMidi;
      }
      reassignFingers(rng, g.steps[t].notes.filter((n) => n.hand === 'L'), 'L');
    }
  };
}

/**
 * Mutador rítmico (mejora 5, queja del Usuario: "no sabe tener ritmo"):
 * re-tima un compás de una mano con una FIGURA RÍTMICA REAL del corpus —
 * las alturas existentes se recolocan (en orden, ciclando) sobre los onsets
 * del patrón. La melodía la ponen los otros mutadores; el groove, este.
 */
function makeRhythmLick(bank: RhythmBank): Mutator {
  return (rng, g) => {
    const hand: Hand = rng() < 0.6 ? 'R' : 'L';
    const patterns = bank[hand];
    if (patterns.length === 0) return;
    const bar = randInt(rng, 0, g.bars - 1);
    const from = bar * STEPS_PER_BAR;
    // Grupos de notas de la mano en el compás, en orden temporal (los acordes
    // viajan juntos): son el material de alturas que se re-coloca.
    const groups: NoteEvent[][] = [];
    for (let t = from; t < from + STEPS_PER_BAR && t < g.steps.length; t++) {
      const handNotes = g.steps[t].notes.filter((n) => n.hand === hand);
      if (handNotes.length > 0) groups.push(handNotes.map((n) => ({ ...n })));
    }
    if (groups.length === 0) return;
    const pattern = pick(rng, patterns);
    // Vaciar la mano en el compás y re-imprimir con el patrón real.
    for (let t = from; t < from + STEPS_PER_BAR && t < g.steps.length; t++) {
      g.steps[t].notes = g.steps[t].notes.filter((n) => n.hand !== hand);
    }
    pattern.forEach(([offset, dur], i) => {
      const t = from + offset;
      if (t >= g.steps.length) return;
      const source = groups[i % groups.length];
      for (const n of source) {
        g.steps[t].notes.push({
          ...n,
          durSteps: Math.min(dur, g.steps.length - t),
        });
      }
    });
  };
}

/**
 * Mutador de la Etapa 2: re-escribe la melodía de un compás caminando con
 * intervalos MUESTREADOS del compositor (LSTM si hay, Markov si no).
 * Conserva el ritmo, inyecta el dibujo melódico aprendido; la física la
 * garantiza el repair posterior.
 */
function makeCorpusLick(model: PhraseSampler): Mutator {
  return (rng, g) => {
    const hand: Hand = rng() < 0.75 ? 'R' : 'L';
    const bar = randInt(rng, 0, g.bars - 1);
    const from = bar * STEPS_PER_BAR;
    const to = from + STEPS_PER_BAR;
    const onsets = g.steps
      .slice(from, to)
      .filter((s) => s.notes.some((n) => n.hand === hand));
    if (onsets.length < 2) return;

    // Contexto: los últimos intervalos reales antes del compás.
    const context = melodyIntervals(g.steps.slice(0, from)).slice(-model.contextLen);
    let prevTop = Math.max(...onsets[0].notes.filter((n) => n.hand === hand).map((n) => n.midi));

    for (let i = 1; i < onsets.length; i++) {
      const interval = model.sample(rng, context);
      const nextTop = clampMidi(prevTop + interval);
      const handNotes = onsets[i].notes.filter((n) => n.hand === hand);
      const currentTop = Math.max(...handNotes.map((n) => n.midi));
      const delta = nextTop - currentTop;
      for (const n of handNotes) n.midi = clampMidi(n.midi + delta);
      context.push(interval);
      if (context.length > model.contextLen) context.shift();
      prevTop = nextTop;
    }
  };
}

/**
 * Variación de un genoma con el pool de mutadores estándar + reparación
 * (para el modo canción: A → A', B...). Determinista con el rng dado.
 */
export function varyGenome(rng: Rng, g: Genome, mutations: number): Genome {
  const child = cloneGenome(g);
  for (let m = 0; m < mutations; m++) weightedPick(rng, MUTATORS)(rng, child);
  return repairGenome(child);
}

export class GeneticTrainer {
  private readonly cfg: TrainConfig;
  private readonly rng: Rng;
  private population: Individual[] = [];
  private generation = 0;
  private readonly corpusModel: MarkovModel | null;
  private readonly chordModel: ChordModel | null;
  private readonly mutators: ReadonlyArray<readonly [Mutator, number]>;

  constructor(cfg: TrainConfig) {
    this.cfg = { ...cfg, weights: { ...cfg.weights } };
    this.rng = mulberry32(cfg.seed);
    this.corpusModel = cfg.corpus ? MarkovModel.fromJSON(cfg.corpus.model) : null;
    this.chordModel = cfg.corpus?.chords ? ChordModel.fromJSON(cfg.corpus.chords) : null;
    // Compositora de frases: la LSTM (memoria 16) manda; Markov es el respaldo.
    // T=1.5 medido con el corpus real del Usuario: sin temperatura la red
    // colapsa en su motivo favorito (bucle 29% → 9%; música real ≈12%).
    const phraser: PhraseSampler | null = cfg.corpus?.lstm
      ? LstmModel.fromJSON(cfg.corpus.lstm, 1.5)
      : this.corpusModel;
    const extra: Array<readonly [Mutator, number]> = [];
    if (phraser) extra.push([makeCorpusLick(phraser), 0.2] as const);
    if (this.chordModel) extra.push([makeChordAccompaniment(this.chordModel), 0.18] as const);
    if (cfg.corpus?.rhythms && (cfg.corpus.rhythms.R.length || cfg.corpus.rhythms.L.length)) {
      extra.push([makeRhythmLick(cfg.corpus.rhythms), 0.2] as const);
    }
    this.mutators = extra.length > 0 ? [...MUTATORS, ...extra] : MUTATORS;
    // Arranque en caliente: hasta media población nace de piezas guardadas
    // (la primera copia de cada semilla va intacta; las demás, mutadas).
    const seeds = (cfg.seedGenomes ?? []).filter((s) => s.bars === cfg.bars);
    const seeded = seeds.length === 0 ? 0 : Math.min(Math.floor(cfg.populationSize / 2), 24);
    for (let i = 0; i < seeded; i++) {
      const child = cloneGenome(seeds[i % seeds.length]);
      child.tempo = cfg.tempo;
      if (i >= seeds.length) {
        const mutations = randInt(this.rng, 1, 3);
        for (let m = 0; m < mutations; m++) weightedPick(this.rng, this.mutators)(this.rng, child);
      }
      repairGenome(child);
      this.population.push({ genome: child, fitness: this.evaluate(child) });
    }
    for (let i = seeded; i < cfg.populationSize; i++) this.population.push(this.freshIndividual());
    this.sortPopulation();
  }

  private evaluate(genome: Genome): number {
    const base =
      this.corpusModel && this.cfg.corpus
        ? blendedReward(
            genome.steps,
            this.corpusModel,
            this.cfg.corpus.alpha,
            this.cfg.weights,
            this.chordModel,
          )
        : musicalReward(genome.steps, this.cfg.weights);
    if (base <= -0.2) return base; // trampas del reward portado: intactas
    // Oído vertical (Fase 6): los choques simultáneos restan hasta 0.3.
    // Fuera del reward.js portado a propósito — es una adición nuestra,
    // decidida con el Usuario y registrada en BITACORA.md.
    return base + HARMONY_WEIGHT * (verticalConsonance(genome.steps) - 1);
  }

  private freshIndividual(): Individual {
    const genome = randomGenome(this.rng, this.cfg);
    return { genome, fitness: this.evaluate(genome) };
  }

  private sortPopulation(): void {
    this.population.sort((a, b) => b.fitness - a.fitness);
  }

  private tournament(): Individual {
    let best: Individual | null = null;
    for (let i = 0; i < this.cfg.tournamentK; i++) {
      const candidate = pick(this.rng, this.population);
      if (best === null || candidate.fitness > best.fitness) best = candidate;
    }
    return best!;
  }

  /** Crossover de 1 punto en frontera de compás (la unidad que mide la estructura). */
  private crossover(a: Genome, b: Genome): Genome {
    const child = cloneGenome(a);
    const cut = randInt(this.rng, 1, a.bars - 1) * STEPS_PER_BAR;
    for (let t = cut; t < child.steps.length; t++) {
      child.steps[t] = { step: t, notes: b.steps[t].notes.map((n) => ({ ...n })) };
    }
    return child;
  }

  stepGeneration(): GenStats {
    const { populationSize, elitism, crossoverProb } = this.cfg;
    const next: Individual[] = this.population.slice(0, elitism);

    const freshCount = 2; // reinyección de diversidad: los 2 peores lugares son sangre nueva
    while (next.length < populationSize - freshCount) {
      const parentA = this.tournament();
      const child =
        this.rng() < crossoverProb && this.cfg.bars > 1
          ? this.crossover(parentA.genome, this.tournament().genome)
          : cloneGenome(parentA.genome);
      const mutations = randInt(this.rng, 1, 3);
      for (let m = 0; m < mutations; m++) weightedPick(this.rng, this.mutators)(this.rng, child);
      repairGenome(child);
      next.push({ genome: child, fitness: this.evaluate(child) });
    }
    while (next.length < populationSize) next.push(this.freshIndividual());

    this.population = next;
    this.sortPopulation();
    this.generation++;
    return this.stats();
  }

  stats(): GenStats {
    const sum = this.population.reduce((acc, ind) => acc + ind.fitness, 0);
    return {
      gen: this.generation,
      best: this.population[0].fitness,
      avg: sum / this.population.length,
    };
  }

  getBest(): { genome: Genome; fitness: number } {
    const top = this.population[0];
    return { genome: cloneGenome(top.genome), fitness: top.fitness };
  }

  /** El feedback humano (Fase 5) ajusta pesos — re-evalúa a toda la población. */
  setWeights(weights: TrainConfig['weights']): void {
    this.cfg.weights = { ...weights };
    for (const ind of this.population) ind.fitness = this.evaluate(ind.genome);
    this.sortPopulation();
  }
}
