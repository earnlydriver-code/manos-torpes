import { useEffect, useRef } from 'react';
import type { HistoryPoint } from '../hooks/useTrainer';

/**
 * Curva de aprendizaje en canvas puro (best y avg por generación).
 * recharts llega en la Fase 3 con el panel de desglose; para esta entrega
 * basta una polilínea barata que se redibuja con cada progreso.
 */

const W = 900;
const H = 130;
const PAD = 6;

type Props = { history: HistoryPoint[] };

export function RewardSparkline({ history }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (history.length < 2) return;

    const values = history.flatMap((p) => [p.best, p.avg]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0.2);
    const toX = (i: number) => PAD + (i / (history.length - 1)) * (W - 2 * PAD);
    const toY = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD);

    // línea de cero
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, toY(0));
    ctx.lineTo(W - PAD, toY(0));
    ctx.stroke();

    const drawSeries = (key: 'best' | 'avg', color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      history.forEach((p, i) => {
        const x = toX(i);
        const y = toY(p[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawSeries('avg', 'rgba(148, 163, 184, 0.7)', 1);
    drawSeries('best', '#f97316', 2);
  }, [history]);

  return <canvas ref={canvasRef} className="sparkline" width={W} height={H} />;
}
