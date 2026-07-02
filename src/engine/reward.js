// reward.js — evalúa una secuencia de 2-4 compases.
// seq = [{ step, notes: [{midi, hand, finger, durSteps}] }, ...]
//
// ⚠️ CÓDIGO DE REFERENCIA PORTADO TAL CUAL de la spec §9.2 — NO editar la lógica.
// Única edición sancionada por el plan: estas líneas de import (el esqueleto de la
// spec asume los helpers y WEIGHTS en scope). Registrado en BITACORA.md.
import {
  entropy,
  histogram,
  ngramSelfSimilarity,
  detectScaleKrumhansl,
  pulseConsistency,
  melodicContour,
  avgStrain,
  travelPenalty,
} from './reward-helpers';
import { DEFAULT_WEIGHTS as WEIGHTS } from './constants';
// --- Fin de la edición. Debajo: código portado tal cual. ---

export function musicalReward(seq, w = WEIGHTS) {
  const notes = seq.flatMap(s => s.notes.map(n => n.midi));
  if (notes.length === 0) return -1; // el silencio total no es una estrategia

  // --- Defensa 1: entropía mínima de tono.
  // Sin esto, el agente descubre que repetir UNA nota consonante en pulso
  // perfecto maximiza consonancia+ritmo, y se queda ahí para siempre.
  const pitchEntropy = entropy(histogram(notes.map(m => m % 12)));
  if (pitchEntropy < 1.2) return -0.5 + pitchEntropy * 0.2; // castigo suave, no acantilado

  // --- Defensa 2: repetición con variación, no repetición literal.
  // Autocorrelación de n-gramas: premiar coincidencias de 4-gramas TRANSPORTADOS
  // o con ritmo alterado; descontar coincidencias idénticas más allá de 2.
  const { variedReps, literalReps } = ngramSelfSimilarity(seq, 4);
  const structure = Math.tanh(variedReps * 0.3) - Math.max(0, literalReps - 2) * 0.1;

  // --- Defensa 3: la consonancia se mide contra la escala DETECTADA de la
  // propia secuencia (perfil Krumhansl), no contra una fija. Si se fija C mayor,
  // el agente nunca modula y el output se vuelve monótono a largo plazo.
  const scale = detectScaleKrumhansl(notes);
  const inScale = notes.filter(m => scale.has(m % 12)).length / notes.length;
  // Punto dulce ~0.85: 100% dentro de escala suena a ejercicio, no a música.
  const consonance = 1 - Math.abs(inScale - 0.85) * 2.5;

  const rhythm = pulseConsistency(seq);            // ver nota abajo
  const contour = melodicContour(seq);             // pasos chicos, saltos compensados
  const physics = -avgStrain(seq) - travelPenalty(seq);

  return w.consonance * consonance + w.rhythm * rhythm +
         w.structure * structure + w.contour * contour +
         w.physics * physics + w.entropy * Math.min(pitchEntropy / 2.5, 1);
}

// pulseConsistency: NO premiar simplemente "notas en beats fuertes".
// Medir en su lugar la autocorrelación del vector de onsets a lags de
// 4, 8 y 16 pasos. Eso premia el groove (incluida síncopa consistente)
// en vez de premiar marchas militares.
