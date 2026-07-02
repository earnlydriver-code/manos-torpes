/** Tipos del código de referencia portado (hand-physics.js). */

export type HandShapeResult = { legal: boolean; reason?: string; strain: number };

export function validateHandShape(
  pressed: number[],
  fingers: number[],
  side: 'L' | 'R',
): HandShapeResult;

/** Pasos de semicorchea que la mano queda "en viaje" al mover el anchor. */
export function travelCost(anchorFrom: number, anchorTo: number): number;

export const SPAN_MAX: number;
export const SPAN_COMFORT: number;
export const TRAVEL_FREE: number;
export const TRAVEL_PER_ST: number;
export const THUMB_PASS_MAX: number;
