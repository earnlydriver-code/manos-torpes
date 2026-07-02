import type { RawNote } from './midi-import';

/**
 * COMPOSITOR INVITADO (mejora 4/4, idea del Usuario: "¿y si conectamos una
 * IA?"): una IA local (Ollama) escribe una frase musical en JSON y nuestro
 * pipeline físico la convierte en un genoma con manos humanas. La invitada
 * propone; la física dispone. Sus piezas van a la biblioteca como SEMILLAS
 * del próximo entrenamiento — no contaminan el corpus (los modelos de
 * melodía/acordes solo aprenden de música real).
 */

const OLLAMA = 'http://localhost:11434';

/** Modelos que no componen (embeddings) — fuera de la lista. */
const NON_GENERATIVE = /embed|bge|minilm/i;

/** Orden de preferencia (por familia). El coder va primero: emite JSON impecable. */
const PREFERRED = ['qwen2.5-coder', 'qwen2.5', 'dolphin-llama3', 'llama3', 'mistral', 'deepseek-r1'];

export type GuestModel = { name: string; sizeGb: number };

export async function listGuestModels(): Promise<GuestModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string; size: number }> };
    return (data.models ?? [])
      .filter((m) => !NON_GENERATIVE.test(m.name))
      .map((m) => ({ name: m.name, sizeGb: m.size / 1e9 }));
  } catch {
    return []; // Ollama apagado o inaccesible: la función existe, la UI avisa
  } finally {
    clearTimeout(timer);
  }
}

export function pickPreferredModel(models: GuestModel[]): string | null {
  for (const prefix of PREFERRED) {
    const hit = models.find((m) => m.name.toLowerCase().startsWith(prefix));
    if (hit) return hit.name;
  }
  return models[0]?.name ?? null;
}

type GuestNote = { m: number; s: number; d: number };
type GuestScore = { melody?: GuestNote[]; bass?: GuestNote[] };

/**
 * Extrae y valida el JSON de la respuesta del modelo. Robusto contra:
 * bloques <think> (deepseek-r1), vallas ```json, texto alrededor, campos
 * fuera de rango (se recortan, no se descartan).
 */
export function parseGuestScore(text: string): RawNote[] | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let score: GuestScore;
  try {
    score = JSON.parse(cleaned.slice(start, end + 1)) as GuestScore;
  } catch {
    return null;
  }
  const notes: RawNote[] = [];
  const push = (list: GuestNote[] | undefined, velocity: number) => {
    for (const n of list ?? []) {
      if (typeof n?.m !== 'number' || typeof n?.s !== 'number' || typeof n?.d !== 'number')
        continue;
      const stepSec = 1; // unidades de step: el tempo real se aplica al importar
      notes.push({
        midi: Math.round(n.m),
        time: Math.max(0, Math.min(31, Math.round(n.s))) * stepSec,
        duration: Math.max(1, Math.min(16, Math.round(n.d))) * stepSec,
        velocity,
      });
    }
  };
  push(score.melody, 0.8);
  push(score.bass, 0.65);
  return notes.length >= 6 ? notes : null;
}

/** Convierte steps-como-segundos a segundos reales para importFromNotes. */
export function toTimedNotes(stepNotes: RawNote[], tempo: number): RawNote[] {
  const stepSec = 60 / tempo / 4;
  return stepNotes.map((n) => ({
    ...n,
    time: n.time * stepSec,
    duration: n.duration * stepSec,
  }));
}

export type GuestRequest = { model: string; style: string; tempo: number };

/** Pide una frase de 2 compases a la invitada. Puede tardar (modelo 7B local). */
export async function generateGuestPhrase({ model, style, tempo }: GuestRequest): Promise<RawNote[]> {
  const prompt = `You are a pianist-composer. Write ONE short piano phrase.
Style: ${style || 'expressive, melodic, memorable'}. Tempo about ${tempo} BPM. Pick ONE key and stay in it.
Time grid: 32 steps of 16th notes (2 bars of 4/4). "s" = start step (0-31), "d" = duration in steps (1-8 melody, 1-16 bass), "m" = MIDI pitch.
Return ONLY this JSON, nothing else:
{"melody":[{"m":69,"s":0,"d":2}, ...],"bass":[{"m":45,"s":0,"d":8}, ...]}
Rules: 10-22 melody notes (MIDI 55-84), mostly stepwise motion with occasional leaps, one clear rhythmic motif repeated WITH variation, end on a stable note of the key. 3-8 bass notes (MIDI 36-59) outlining the chords. No two notes with the same "m" overlapping in time.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.9, num_predict: 900 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
    const data = (await res.json()) as { response?: string };
    const stepNotes = parseGuestScore(data.response ?? '');
    if (!stepNotes) throw new Error('la invitada no devolvió una partitura legible');
    return toTimedNotes(stepNotes, tempo);
  } finally {
    clearTimeout(timer);
  }
}
