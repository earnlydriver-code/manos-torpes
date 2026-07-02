import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KBD_HI, KBD_LO } from '../engine/constants';
import type { StepHighlight } from '../audio/player';

/**
 * Teclado Canvas de 61 teclas (C2–C7). Clickeable, y al reproducir ilumina las
 * teclas por mano (L azul, R naranja, opacidad ∝ vel) con el número de dedo.
 */

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const LOGICAL_W = 1080;
const LOGICAL_H = 170;
const BLACK_H = LOGICAL_H * 0.62;
const HAND_COLORS = { L: '59, 130, 246', R: '249, 115, 22' } as const; // azul / naranja

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

type Props = {
  highlights: StepHighlight[];
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
};

export function KeyboardCanvas({ highlights, onNoteOn, onNoteOff }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useMemo(buildGeometry, []);
  const [mouseMidi, setMouseMidi] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const byMidi = new Map(highlights.map((h) => [h.midi, h]));

    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    const paint = (key: KeyGeom) => {
      const h = byMidi.get(key.midi);
      const pressed = h !== undefined || mouseMidi === key.midi;
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
      if (h) {
        // Número de dedo (1=pulgar..5=meñique) sobre la tecla activa
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
    };

    for (const key of keys) if (!key.black) paint(key);
    for (const key of keys) if (key.black) paint(key);
  }, [highlights, keys, mouseMidi]);

  useEffect(draw, [draw]);

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

  const release = useCallback(() => {
    setMouseMidi((current) => {
      if (current !== null) onNoteOff(current);
      return null;
    });
  }, [onNoteOff]);

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
          setMouseMidi(midi);
        }
      }}
      onPointerUp={release}
      onPointerLeave={release}
    />
  );
}
