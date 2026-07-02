import { useCallback, useEffect, useMemo, useRef } from 'react';
import { KBD_HI, KBD_LO } from '../engine/constants';
import type { StepHighlight } from '../audio/player';

/**
 * Teclado Canvas de 61 teclas (C2–C7). Clickeable (multi-touch: una tecla por
 * puntero), y al reproducir ilumina las teclas por mano con número de dedo y
 * dibuja las MANOS ANIMADAS: una sombra por mano que se desliza suavemente
 * sobre su alcance actual (Fase 3 de la spec).
 */

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const LOGICAL_W = 1080;
const LOGICAL_H = 170;
const BLACK_H = LOGICAL_H * 0.62;
const HAND_COLORS = { L: '59, 130, 246', R: '249, 115, 22' } as const; // azul / naranja
const HAND_LABELS = { L: 'izquierda', R: 'derecha' } as const;

type KeyGeom = { midi: number; x: number; w: number; black: boolean };

function buildGeometry(): KeyGeom[] {
  let whiteCount = 0;
  for (let m = KBD_LO; m <= KBD_HI; m++) if (WHITE_PCS.has(m % 12)) whiteCount++;
  const whiteW = LOGICAL_W / whiteCount;
  const blackW = whiteW * 0.62;
  const keys: KeyGeom[] = [];
  let whiteIndex = 0;
  for (let m = KBD_LO; m <= KBD_HI; m++) {
    if (WHITE_PCS.has(m % 12)) {
      keys.push({ midi: m, x: whiteIndex * whiteW, w: whiteW, black: false });
      whiteIndex++;
    } else {
      keys.push({ midi: m, x: whiteIndex * whiteW - blackW / 2, w: blackW, black: true });
    }
  }
  return keys;
}

type HandAnim = { lo: number; hi: number; alpha: number; targetLo: number; targetHi: number; targetAlpha: number };

type Props = {
  highlights: StepHighlight[];
  handsActive: boolean; // true durante la reproducción: las manos se ven y persiguen sus objetivos
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
};

export function KeyboardCanvas({ highlights, handsActive, onNoteOn, onNoteOff }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useMemo(buildGeometry, []);
  const keyByMidi = useMemo(() => new Map(keys.map((k) => [k.midi, k])), [keys]);

  // Una tecla por puntero (multi-touch): un único valor escalar deja notas
  // atascadas al tocar con varios dedos (hallazgo de la revisión adversarial).
  const pointerNotesRef = useRef(new Map<number, number>());
  const highlightsRef = useRef<StepHighlight[]>(highlights);
  highlightsRef.current = highlights;

  const handsRef = useRef<Record<'L' | 'R', HandAnim>>({
    L: { lo: 48, hi: 55, alpha: 0, targetLo: 48, targetHi: 55, targetAlpha: 0 },
    R: { lo: 72, hi: 79, alpha: 0, targetLo: 72, targetHi: 79, targetAlpha: 0 },
  });
  const rafRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const current = highlightsRef.current;
    const byMidi = new Map(current.map((h) => [h.midi, h]));
    const pointerMidis = new Set(pointerNotesRef.current.values());

    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    const paintKey = (key: KeyGeom) => {
      const h = byMidi.get(key.midi);
      const pressed = h !== undefined || pointerMidis.has(key.midi);
      const height = key.black ? BLACK_H : LOGICAL_H;
      ctx.fillStyle = key.black ? '#1a1a1f' : '#f7f4ec';
      ctx.fillRect(key.x, 0, key.w, height);
      if (pressed) {
        const rgb = h ? HAND_COLORS[h.hand] : '160, 160, 170';
        const alpha = h ? 0.35 + 0.55 * h.vel : 0.5;
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fillRect(key.x, 0, key.w, height);
      }
      if (!key.black) {
        ctx.strokeStyle = '#2a2a30';
        ctx.lineWidth = 1;
        ctx.strokeRect(key.x + 0.5, 0.5, key.w - 1, height - 1);
      }
    };
    for (const key of keys) if (!key.black) paintKey(key);
    for (const key of keys) if (key.black) paintKey(key);

    // Sombras de mano animadas (bajo los números de dedo).
    for (const hand of ['L', 'R'] as const) {
      const anim = handsRef.current[hand];
      if (anim.alpha < 0.01) continue;
      const loKey = keyByMidi.get(Math.round(anim.lo));
      const hiKey = keyByMidi.get(Math.round(anim.hi));
      if (!loKey || !hiKey) continue;
      const x = loKey.x - 2;
      const w = hiKey.x + hiKey.w - loKey.x + 4;
      ctx.beginPath();
      ctx.roundRect(x, 4, w, LOGICAL_H - 8, 10);
      ctx.fillStyle = `rgba(${HAND_COLORS[hand]}, ${0.13 * anim.alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${HAND_COLORS[hand]}, ${0.55 * anim.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = `rgba(${HAND_COLORS[hand]}, ${0.9 * anim.alpha})`;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = hand === 'L' ? 'left' : 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(HAND_LABELS[hand], hand === 'L' ? x + 6 : x + w - 6, 8);
    }

    // Números de dedo (1 pulgar … 5 meñique) encima de todo.
    for (const h of current) {
      const key = keyByMidi.get(h.midi);
      if (!key) continue;
      const height = key.black ? BLACK_H : LOGICAL_H;
      const cx = key.x + key.w / 2;
      const cy = height - 18;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${HAND_COLORS[h.hand]})`;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.finger), cx, cy + 0.5);
    }
  }, [keys, keyByMidi]);

  // Persecución suave: cada frame, lo/hi/alpha se acercan a su objetivo.
  const animate = useCallback(() => {
    let settled = true;
    for (const hand of ['L', 'R'] as const) {
      const a = handsRef.current[hand];
      a.lo += (a.targetLo - a.lo) * 0.18;
      a.hi += (a.targetHi - a.hi) * 0.18;
      a.alpha += (a.targetAlpha - a.alpha) * 0.15;
      if (
        Math.abs(a.targetLo - a.lo) > 0.05 ||
        Math.abs(a.targetHi - a.hi) > 0.05 ||
        Math.abs(a.targetAlpha - a.alpha) > 0.01
      )
        settled = false;
    }
    draw();
    rafRef.current = settled ? null : requestAnimationFrame(animate);
  }, [draw]);

  const kickAnimation = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  useEffect(() => {
    for (const hand of ['L', 'R'] as const) {
      const notes = highlights.filter((h) => h.hand === hand);
      const anim = handsRef.current[hand];
      if (handsActive && notes.length > 0) {
        anim.targetLo = Math.max(KBD_LO, Math.min(...notes.map((n) => n.midi)) - 1);
        anim.targetHi = Math.min(KBD_HI, Math.max(...notes.map((n) => n.midi)) + 1);
        anim.targetAlpha = 1;
      } else if (!handsActive) {
        anim.targetAlpha = 0;
      }
      // Con handsActive y sin notas: la mano descansa donde estaba (sigue visible).
    }
    kickAnimation();
  }, [highlights, handsActive, kickAnimation]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        // Sin esto, tras el re-montaje de StrictMode/HMR kickAnimation cree
        // que el bucle sigue vivo y el canvas no se vuelve a dibujar jamás.
        rafRef.current = null;
      }
    };
  }, []);

  const midiAt = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): number | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * LOGICAL_W;
      const y = ((event.clientY - rect.top) / rect.height) * LOGICAL_H;
      // Las negras están por encima: se comprueban primero.
      if (y <= BLACK_H) {
        for (const key of keys) if (key.black && x >= key.x && x <= key.x + key.w) return key.midi;
      }
      for (const key of keys) if (!key.black && x >= key.x && x <= key.x + key.w) return key.midi;
      return null;
    },
    [keys],
  );

  const releasePointer = useCallback(
    (pointerId: number) => {
      const midi = pointerNotesRef.current.get(pointerId);
      if (midi === undefined) return;
      pointerNotesRef.current.delete(pointerId);
      onNoteOff(midi);
      draw();
    },
    [onNoteOff, draw],
  );

  return (
    <canvas
      ref={canvasRef}
      className="keyboard"
      width={LOGICAL_W}
      height={LOGICAL_H}
      onPointerDown={(e) => {
        const midi = midiAt(e);
        if (midi !== null) {
          onNoteOn(midi);
          pointerNotesRef.current.set(e.pointerId, midi);
          draw();
        }
      }}
      onPointerUp={(e) => releasePointer(e.pointerId)}
      onPointerCancel={(e) => releasePointer(e.pointerId)}
      onPointerLeave={(e) => releasePointer(e.pointerId)}
    />
  );
}
