import type { Step } from '../types/music';
import { SPAN_MAX, travelCost, validateHandShape } from './hand-physics';

/**
 * Auxiliares de la recompensa musical. Sus firmas se conforman EXACTAMENTE a cómo
 * las llama el reward.js portado de la spec — reward.js no se adapta a ellas.
 */

/** Distribución normalizada (suma 1) de clases de tono 0..11. Vacío ⇒ todo ceros. */
export function histogram(pitchClasses: number[]): number[] {
  const bins = new Array<number>(12).fill(0);
  for (const pc of pitchClasses) bins[((pc % 12) + 12) % 12] += 1;
  if (pitchClasses.length === 0) return bins;
  return bins.map((c) => c / pitchClasses.length);
}

/** Entropía de Shannon en bits: -Σ p·log2(p), ignorando bins con p=0. */
export function entropy(dist: number[]): number {
  let e = 0;
  for (const p of dist) if (p > 0) e -= p * Math.log2(p);
  return e;
}

// Perfiles Krumhansl-Kessler (estabilidad percibida de cada grado de la escala).
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

export type ScaleInfo = { root: number; mode: 'major' | 'minor'; confidence: number };

/** Escala más probable de un conjunto de notas MIDI (correlación con perfiles K-K). */
export function scaleInfo(notes: number[]): ScaleInfo {
  const h = histogram(notes.map((m) => m % 12));
  let best: ScaleInfo = { root: 0, mode: 'major', confidence: 0 };
  let bestR = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const [mode, profile] of [
      ['major', KK_MAJOR],
      ['minor', KK_MINOR],
    ] as const) {
      // El perfil rotado a esta tónica: el valor del perfil para la clase de tono i
      const rotated = h.map((_, i) => profile[(i - root + 12) % 12]);
      const r = pearson(h, rotated);
      if (r > bestR) {
        bestR = r;
        best = { root, mode, confidence: Math.max(0, r) };
      }
    }
  }
  return best;
}

/**
 * Las 7 clases de tono de la escala detectada. reward.js (portado) la consume
 * con `scale.has(midi % 12)`.
 */
export function detectScaleKrumhansl(notes: number[]): Set<number> {
  if (notes.length === 0) return new Set(MAJOR_DEGREES);
  const { root, mode } = scaleInfo(notes);
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  return new Set(degrees.map((d) => (d + root) % 12));
}

/**
 * Consistencia de pulso ∈ [0,1] por autocorrelación del vector de onsets a lags
 * de 4, 8 y 16 pasos (nota de la spec: premia groove — incluida síncopa
 * consistente — en vez de premiar "notas en beats fuertes" tipo marcha).
 */
export function pulseConsistency(seq: Step[]): number {
  const T = seq.length;
  if (T === 0) return 0;
  const onsets = new Array<number>(T).fill(0);
  let activeSteps = 0;
  for (let t = 0; t < T; t++) {
    let sum = 0;
    for (const n of seq[t].notes) sum += n.vel;
    onsets[t] = sum;
    if (sum > 0) activeSteps++;
  }
  if (activeSteps < 3) return 0;
  let energy = 0;
  for (const v of onsets) energy += v * v;
  if (energy === 0) return 0;
  let best = 0;
  for (const lag of [4, 8, 16]) {
    if (lag >= T) continue;
    let acc = 0;
    for (let t = 0; t + lag < T; t++) acc += onsets[t] * onsets[t + lag];
    best = Math.max(best, acc / energy);
  }
  // Factor de densidad: que 2-3 onsets casuales no puntúen alto por suerte.
  const density = Math.min(1, activeSteps / (T / 4));
  return Math.min(1, best) * density;
}

/**
 * Autosimilitud por n-gramas de NOTAS (eventos de onset, no pasos de reloj —
 * la spec pide "n-gramas de notas"). Devuelve CONTEOS, como los consume el
 * reward.js portado:
 *  - literalReps: re-apariciones de un n-grama idéntico en alturas Y ritmo.
 *  - variedReps: re-apariciones transportadas (mismos intervalos, distinta
 *    altura) o con las mismas alturas pero el ritmo alterado.
 */
export function ngramSelfSimilarity(
  seq: Step[],
  n: number,
): { variedReps: number; literalReps: number } {
  // Secuencia de eventos: cada step con notas es un evento (acorde ordenado + posición).
  const events: { step: number; pitches: number[] }[] = [];
  for (let t = 0; t < seq.length; t++) {
    if (seq[t].notes.length > 0)
      events.push({ step: t, pitches: seq[t].notes.map((nn) => nn.midi).sort((a, b) => a - b) });
  }
  if (events.length < n) return { variedReps: 0, literalReps: 0 };

  const fullCounts = new Map<string, number>(); // altura+ritmo idénticos
  const transposedVariants = new Map<string, Set<string>>(); // forma normalizada → alturas absolutas distintas
  const rhythmAltered = new Map<string, Set<string>>(); // alturas → ritmos distintos

  for (let start = 0; start + n <= events.length; start++) {
    const window = events.slice(start, start + n);
    const base = window[0].pitches[0];
    const pitchKey = window.map((e) => e.pitches.join(',')).join('|');
    const normKey = window.map((e) => e.pitches.map((m) => m - base).join(',')).join('|');
    const rhythmKey = window
      .slice(1)
      .map((e, i) => e.step - window[i].step)
      .join(',');
    const fullKey = `${pitchKey}#${rhythmKey}`;
    const normFullKey = `${normKey}#${rhythmKey}`;

    fullCounts.set(fullKey, (fullCounts.get(fullKey) ?? 0) + 1);
    if (!transposedVariants.has(normFullKey)) transposedVariants.set(normFullKey, new Set());
    transposedVariants.get(normFullKey)!.add(pitchKey);
    if (!rhythmAltered.has(pitchKey)) rhythmAltered.set(pitchKey, new Set());
    rhythmAltered.get(pitchKey)!.add(rhythmKey);
  }

  let literalReps = 0;
  for (const count of fullCounts.values()) literalReps += Math.max(0, count - 1);

  let variedReps = 0;
  // Transportados: mismo dibujo interno y mismo ritmo, distinta altura absoluta.
  for (const variants of transposedVariants.values()) variedReps += variants.size - 1;
  // Ritmo alterado: mismas alturas, distinta colocación temporal.
  for (const variants of rhythmAltered.values()) variedReps += variants.size - 1;

  return { variedReps, literalReps };
}

/**
 * Contorno melódico ∈ [0,1] de la voz superior: premia movimiento por grados
 * (1-2 st), castiga el estatismo y los saltos (≥5 st) que no se compensan con
 * un movimiento en dirección contraria.
 */
export function melodicContour(seq: Step[]): number {
  const tops: number[] = [];
  for (const s of seq) {
    if (s.notes.length === 0) continue;
    tops.push(Math.max(...s.notes.map((n) => n.midi)));
  }
  if (tops.length < 3) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < tops.length; i++) intervals.push(tops[i] - tops[i - 1]);

  const total = intervals.length;
  let stepwise = 0;
  let still = 0;
  let leaps = 0;
  let recovered = 0;
  for (let i = 0; i < total; i++) {
    const d = Math.abs(intervals[i]);
    if (d >= 1 && d <= 2) stepwise++;
    if (d === 0) still++;
    if (d >= 5) {
      leaps++;
      const next = intervals[i + 1];
      if (next !== undefined && next !== 0 && Math.sign(next) === -Math.sign(intervals[i]))
        recovered++;
    }
  }
  const stepwiseF = stepwise / total;
  const stillF = still / total;
  const leapsF = leaps / total;
  const recoveryF = leaps === 0 ? 1 : recovered / leaps;
  const score =
    0.6 * stepwiseF + 0.2 * (1 - stillF) + 0.2 * recoveryF - 0.3 * Math.max(0, leapsF - 0.3);
  return Math.max(0, Math.min(1, score));
}

/**
 * Tensión física blanda promedio ∈ [0,1]. Reutiliza el `strain` que devuelve el
 * validateHandShape PORTADO (fuente de verdad) — no re-deriva una fórmula propia.
 */
export function avgStrain(seq: Step[]): number {
  let total = 0;
  let count = 0;
  for (const s of seq) {
    for (const hand of ['L', 'R'] as const) {
      const handNotes = s.notes.filter((n) => n.hand === hand);
      if (handNotes.length === 0) continue;
      const sorted = [...handNotes].sort((a, b) => a.midi - b.midi);
      const result = validateHandShape(
        sorted.map((n) => n.midi),
        sorted.map((n) => n.finger),
        hand,
      );
      total += result.legal ? result.strain : 1;
      count++;
    }
  }
  return count === 0 ? 0 : Math.min(1, total / count);
}

/**
 * Penalización de desplazamiento ∈ [0,1]: suma el travelCost PORTADO a lo largo
 * de la trayectoria del anchor de cada mano, normalizada por beats. Semántica
 * de anchor-VENTANA (la misma de legal-actions/repairGenome): tocar dentro del
 * alcance [anchor-12, anchor] no es viajar — solo paga cuando el onset cae
 * fuera y la mano se muda lo mínimo para alcanzarlo.
 */
export function travelPenalty(seq: Step[]): number {
  if (seq.length === 0) return 0;
  let total = 0;
  for (const hand of ['L', 'R'] as const) {
    let feasible: [number, number] | null = null; // intervalo factible de anchors
    for (const s of seq) {
      const handNotes = s.notes.filter((n) => n.hand === hand);
      if (handNotes.length === 0) continue;
      const mn = Math.min(...handNotes.map((n) => n.midi));
      const mx = Math.max(...handNotes.map((n) => n.midi));
      const lo = mx;
      const hi = mn + SPAN_MAX;
      if (feasible === null) {
        feasible = [lo, hi];
      } else if (feasible[0] <= hi && lo <= feasible[1]) {
        feasible = [Math.max(feasible[0], lo), Math.min(feasible[1], hi)]; // sin viaje
      } else {
        const dist = lo > feasible[1] ? lo - feasible[1] : feasible[0] - hi;
        total += travelCost(0, dist);
        feasible = [lo, hi];
      }
    }
  }
  const beats = seq.length / 4;
  return Math.max(0, Math.min(1, total / beats));
}
