/// <reference lib="webworker" />
import { GeneticTrainer } from '../engine/genetic';
import type { MainToWorker, WorkerToMain } from './protocol';

/**
 * Loop de entrenamiento en Web Worker: la UI nunca se congela. Regla vital:
 * el loop CEDE el hilo cada tanda de generaciones (los workers son
 * single-threaded — un while(true) sin ceder jamás vería 'pause'/'stop').
 */

const post = (msg: WorkerToMain): void =>
  (self as unknown as { postMessage(m: WorkerToMain): void }).postMessage(msg);

const GENS_PER_CHUNK = 25;
const PROGRESS_EVERY_MS = 100;

let trainer: GeneticTrainer | null = null;
let running = false;
let loopActive = false;
let bestSoFar = -Infinity;
let genPerSecond: number | null = null;
let lastProgressAt = 0;

function announceBest(gen: number): void {
  if (!trainer) return;
  const { genome, fitness } = trainer.getBest();
  if (fitness > bestSoFar + 1e-9) {
    bestSoFar = fitness;
    post({ type: 'newBest', gen, reward: fitness, genome });
  }
}

async function loop(): Promise<void> {
  if (loopActive) return;
  loopActive = true;
  while (running && trainer) {
    const chunkStart = performance.now();
    let stats = null;
    for (let i = 0; i < GENS_PER_CHUNK && running; i++) {
      stats = trainer.stepGeneration();
      if (stats.best > bestSoFar + 1e-9) announceBest(stats.gen);
    }
    if (stats) {
      const now = performance.now();
      if (now - lastProgressAt >= PROGRESS_EVERY_MS) {
        lastProgressAt = now;
        post({ type: 'progress', gen: stats.gen, best: stats.best, avg: stats.avg });
      }
    }
    if (genPerSecond !== null) {
      const elapsed = performance.now() - chunkStart;
      const targetMs = (GENS_PER_CHUNK / genPerSecond) * 1000;
      await new Promise((r) => setTimeout(r, Math.max(0, targetMs - elapsed)));
    } else {
      await new Promise((r) => setTimeout(r, 0)); // ceder el hilo
    }
  }
  loopActive = false;
}

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init': {
      trainer = new GeneticTrainer(msg.config);
      running = false;
      bestSoFar = -Infinity;
      const stats = trainer.stats();
      post({ type: 'progress', gen: stats.gen, best: stats.best, avg: stats.avg });
      announceBest(stats.gen); // el mejor aleatorio inicial, para poder escucharlo ya
      break;
    }
    case 'start':
      if (!trainer) {
        post({ type: 'error', message: 'start sin init previo' });
        return;
      }
      if (!running) {
        running = true;
        void loop();
      }
      break;
    case 'pause':
      running = false;
      if (trainer) post({ type: 'paused', gen: trainer.stats().gen });
      break;
    case 'stop':
      running = false;
      trainer = null;
      post({ type: 'stopped' });
      break;
    case 'setThrottle':
      genPerSecond = msg.genPerSecond;
      break;
    case 'setWeights':
      trainer?.setWeights(msg.weights);
      break;
    case 'requestSnapshot':
      if (trainer) {
        const { genome, fitness } = trainer.getBest();
        post({ type: 'snapshot', gen: trainer.stats().gen, reward: fitness, genome });
      }
      break;
  }
};

post({ type: 'ready' });
