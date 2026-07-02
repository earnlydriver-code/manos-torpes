// hand-physics.js — fuente de verdad de lo que una mano humana puede hacer.
// Teclas = índices MIDI. side: 'L' | 'R'.
//
// ⚠️ CÓDIGO DE REFERENCIA PORTADO TAL CUAL de la spec §9.1 — NO editar la lógica.
// Si un test falla, el sospechoso es el test o el port, nunca este código.

const SPAN_MAX = 12;          // semitonos entre dedo extremo y dedo extremo
const SPAN_COMFORT = 9;       // más allá de esto: penalización, no prohibición
const TRAVEL_FREE = 2;        // saltos de anchor <= 2 st: gratis (movimiento de muñeca)
const TRAVEL_PER_ST = 0.5;    // beats de "viaje" por semitono extra
const THUMB_PASS_MAX = 3;     // el pulgar puede pasar por debajo hasta 3 st

/**
 * @param {number[]} pressed  teclas MIDI presionadas AHORA por esta mano (ordenadas asc)
 * @param {number[]} fingers  dedo asignado a cada tecla, mismo orden (1=pulgar..5=meñique)
 * @param {'L'|'R'} side
 * @returns {{legal: boolean, reason?: string, strain: number}}
 *   strain ∈ [0,1]: 0 = cómodo, 1 = límite físico. Va a la recompensa como penalización.
 */
export function validateHandShape(pressed, fingers, side) {
  if (pressed.length === 0) return { legal: true, strain: 0 };
  if (pressed.length > 5) return { legal: false, reason: 'more_than_5_fingers' };
  if (new Set(fingers).size !== fingers.length)
    return { legal: false, reason: 'finger_reused' };
  const span = pressed[pressed.length - 1] - pressed[0];
  if (span > SPAN_MAX) return { legal: false, reason: 'span_exceeded' };
  // Orden de dedos sobre las teclas. En mano derecha, teclas ascendentes
  // ⇒ dedos ascendentes. En mano izquierda es EL ESPEJO: teclas ascendentes
  // ⇒ dedos DESCENDENTES (el pulgar de la izquierda queda en la nota más aguda).
  // Este espejo es el bug #1 en implementaciones ingenuas.
  const expected = side === 'R' ? fingers : [...fingers].reverse();
  for (let i = 1; i < expected.length; i++) {
    const gap = expected[i] - expected[i - 1];
    if (gap > 0) continue; // orden normal
    // Única inversión permitida: paso de pulgar (dedo 1 cruzando bajo 2 o 3),
    // y solo si la distancia en teclas es corta.
    const isThumbPass =
      expected[i] === 1 &&
      (expected[i - 1] === 2 || expected[i - 1] === 3) &&
      Math.abs(pressed[i] - pressed[i - 1]) <= THUMB_PASS_MAX;
    if (!isThumbPass) return { legal: false, reason: 'finger_crossing' };
  }
  // Strain: crece cuadráticamente pasado el span cómodo, y con dedos
  // adyacentes muy abiertos (2-3 abarcando >4 st duele más que 1-5 abarcando 8).
  let strain = span > SPAN_COMFORT
    ? Math.min(1, ((span - SPAN_COMFORT) / (SPAN_MAX - SPAN_COMFORT)) ** 2)
    : 0;
  for (let i = 1; i < pressed.length; i++) {
    const keyGap = pressed[i] - pressed[i - 1];
    const fingerGap = Math.abs(fingers[i] - fingers[i - 1]);
    if (fingerGap === 1 && keyGap > 4) strain = Math.min(1, strain + 0.15 * (keyGap - 4));
  }
  return { legal: true, strain };
}

/**
 * Movimiento de anchor entre beats. Devuelve cuántos pasos de semicorchea
 * la mano queda "en viaje" (sin poder tocar). El scheduler DEBE consultar
 * esto ANTES de generar la acción del siguiente paso — no después.
 * Consultarlo después es el bug #2: produce agentes que "teletransportan"
 * la mano y aprenden música físicamente imposible que luego no se puede
 * reproducir al añadir la restricción.
 */
export function travelCost(anchorFrom, anchorTo) {
  const d = Math.abs(anchorTo - anchorFrom);
  return d <= TRAVEL_FREE ? 0 : Math.ceil((d - TRAVEL_FREE) * TRAVEL_PER_ST);
}

// --- Añadido al port (sin cambiar lógica): exportar las constantes para que
// --- el resto del motor no las duplique. Registrado en BITACORA.md.
export { SPAN_MAX, SPAN_COMFORT, TRAVEL_FREE, TRAVEL_PER_ST, THUMB_PASS_MAX };
