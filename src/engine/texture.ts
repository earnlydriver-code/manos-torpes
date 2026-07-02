import type { Step } from '../types/music';
import { STEPS_PER_BAR } from './constants';

/**
 * TEXTURA (exploit nº4, cazado por el Usuario: "3 notas izquierda, 7
 * derecha"): el oído vertical castiga choques pero tocar casi nada garantiza
 * cero choques — el agente aprendió a callarse. Aquí se mide la textura de la
 * música (ataques por compás y voces simultáneas) y se compara con la del
 * corpus: el vacío deja de ser rentable, la plenitud de la música real es la
 * referencia.
 */

export type Texture = { onsetsPerBar: number; voices: number };

export function computeTexture(steps: Step[]): Texture {
  const bars = Math.max(1, steps.length / STEPS_PER_BAR);
  const T = steps.length;
  const sounding = new Array<number>(T).fill(0);
  let onsetSteps = 0;
  for (const s of steps) {
    if (s.notes.length > 0) onsetSteps++;
    for (const n of s.notes) {
      const end = Math.min(T, s.step + Math.max(1, n.durSteps));
      for (let t = s.step; t < end; t++) sounding[t]++;
    }
  }
  const active = sounding.filter((v) => v > 0);
  const voices = active.length > 0 ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  return { onsetsPerBar: onsetSteps / bars, voices };
}

/** Media de texturas (la referencia del corpus se promedia entre ventanas). */
export function meanTexture(textures: Texture[]): Texture {
  if (textures.length === 0) return { onsetsPerBar: 0, voices: 0 };
  return {
    onsetsPerBar: textures.reduce((a, t) => a + t.onsetsPerBar, 0) / textures.length,
    voices: textures.reduce((a, t) => a + t.voices, 0) / textures.length,
  };
}

/**
 * Parecido de textura ∈ [0,1]: 1 = tan lleno (o tan aireado) como la música
 * real. Penaliza por igual el vacío y el atiborramiento.
 */
export function textureSimilarity(steps: Step[], ref: Texture): number {
  if (ref.onsetsPerBar <= 0) return 1; // sin referencia no se opina
  const t = computeTexture(steps);
  const ratio = (a: number, b: number) =>
    a <= 0 || b <= 0 ? 0 : Math.min(a, b) / Math.max(a, b);
  return 0.6 * ratio(t.onsetsPerBar, ref.onsetsPerBar) + 0.4 * ratio(t.voices, ref.voices);
}
