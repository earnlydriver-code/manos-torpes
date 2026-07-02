import type { Step } from '../types/music';

/**
 * OÍDO VERTICAL (Fase 6, decidido con el Usuario tras sus pruebas): la
 * heurística de la spec mide consonancia contra la escala pero no escucha
 * qué suena A LA VEZ — dos notas correctas de la escala pueden chocar
 * (segunda menor sostenida) sin castigo. Este módulo puntúa los choques
 * simultáneos con la regla real de la música: la disonancia "va" cuando es
 * breve y en parte débil (nota de paso); duele cuando es sostenida y en
 * parte fuerte del compás.
 */

/** Aspereza por clase de intervalo (0-11 semitonos, módulo octava). */
const HARSHNESS: Record<number, number> = {
  1: 1, // segunda menor / novena menor: el choque clásico
  11: 0.9, // séptima mayor
  6: 0.55, // tritono
  2: 0.25, // segunda mayor (común en acompañamientos: leve)
  10: 0.2, // séptima menor (jazz la ama: muy leve)
};

type Sounding = { midi: number; totalDur: number };

/**
 * Consonancia vertical ∈ [0,1]: 1 = nada choca, 0 = choques duros en cada
 * momento polifónico. Considera también las notas SOSTENIDAS de steps
 * anteriores (un bajo mantenido puede chocar con la melodía que llega).
 */
export function verticalConsonance(seq: Step[]): number {
  const T = seq.length;
  const active: Sounding[][] = Array.from({ length: T }, () => []);
  for (const s of seq) {
    for (const n of s.notes) {
      const end = Math.min(T, s.step + Math.max(1, n.durSteps));
      for (let t = s.step; t < end; t++) active[t].push({ midi: n.midi, totalDur: n.durSteps });
    }
  }

  let penalty = 0;
  let polySteps = 0;
  for (let t = 0; t < T; t++) {
    const notes = active[t];
    if (notes.length < 2) continue;
    polySteps++;
    // El peor choque define el step (sumar pares infla acordes densos).
    let worst = 0;
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const ic = Math.abs(notes[i].midi - notes[j].midi) % 12;
        const harsh = HARSHNESS[ic] ?? 0;
        if (harsh === 0) continue;
        const shortest = Math.min(notes[i].totalDur, notes[j].totalDur);
        const beatWeight = t % 4 === 0 ? 1 : t % 2 === 0 ? 0.6 : 0.35;
        let weight: number;
        if (shortest <= 1 && t % 4 !== 0) {
          weight = 0.2 * beatWeight; // nota de paso: la disonancia "va"
        } else if (shortest <= 2) {
          weight = beatWeight; // roce breve: el pulso decide cuánto duele
        } else {
          weight = 1; // choque SOSTENIDO: duele siempre, caiga donde caiga
        }
        worst = Math.max(worst, harsh * weight);
      }
    }
    penalty += worst;
  }

  if (polySteps === 0) return 1; // sin polifonía no hay choques posibles
  return Math.max(0, Math.min(1, 1 - penalty / polySteps));
}
