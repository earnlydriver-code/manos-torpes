import { describe, expect, it } from 'vitest';
import { parseGuestScore, pickPreferredModel, toTimedNotes } from '../../corpus/guest';
import { importFromNotes } from '../../corpus/midi-import';
import { validateStep } from '../step-validator';

const GOOD_JSON = `{"melody":[
  {"m":69,"s":0,"d":2},{"m":71,"s":2,"d":2},{"m":72,"s":4,"d":4},{"m":71,"s":8,"d":2},
  {"m":69,"s":10,"d":2},{"m":67,"s":12,"d":4},{"m":69,"s":16,"d":2},{"m":71,"s":18,"d":2},
  {"m":72,"s":20,"d":4},{"m":74,"s":24,"d":4},{"m":72,"s":28,"d":4}],
 "bass":[{"m":45,"s":0,"d":8},{"m":41,"s":8,"d":8},{"m":43,"s":16,"d":8},{"m":45,"s":24,"d":8}]}`;

describe('parseGuestScore (la respuesta del LLM nunca es de fiar)', () => {
  it('parsea JSON limpio con melodía y bajo', () => {
    const notes = parseGuestScore(GOOD_JSON);
    expect(notes).not.toBeNull();
    expect(notes!.length).toBe(15);
  });

  it('sobrevive a bloques <think> (deepseek-r1) y vallas de código', () => {
    const wrapped = `<think>Let me compose something in A minor...\n{"draft": true}</think>\nHere is the piece:\n\`\`\`json\n${GOOD_JSON}\n\`\`\`\nEnjoy!`;
    const notes = parseGuestScore(wrapped);
    expect(notes).not.toBeNull();
    expect(notes!.length).toBe(15);
  });

  it('recorta campos fuera de rango en vez de descartar la frase', () => {
    const messy = `{"melody":[{"m":69,"s":-4,"d":2},{"m":70,"s":99,"d":0},{"m":71,"s":4,"d":50},
      {"m":72,"s":6,"d":2},{"m":74,"s":8,"d":2},{"m":76,"s":10,"d":2}]}`;
    const notes = parseGuestScore(messy);
    expect(notes).not.toBeNull();
    for (const n of notes!) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThanOrEqual(31);
      expect(n.duration).toBeGreaterThanOrEqual(1);
      expect(n.duration).toBeLessThanOrEqual(16);
    }
  });

  it('basura, JSON roto o muy pocas notas ⇒ null (no explota)', () => {
    expect(parseGuestScore('lo siento, no puedo componer')).toBeNull();
    expect(parseGuestScore('{"melody": [{"m": 60, "s": }]}')).toBeNull();
    expect(parseGuestScore('{"melody":[{"m":60,"s":0,"d":2}]}')).toBeNull();
    expect(parseGuestScore('{"melody":[{"m":"do","s":0,"d":2}]}')).toBeNull();
  });

  it('la frase invitada pasa por el filtro físico y sale 100% legal', () => {
    const raw = toTimedNotes(parseGuestScore(GOOD_JSON)!, 80);
    const piece = importFromNotes('invitada', raw, 80, 'midi');
    expect(piece.windowsByBars[2].length).toBeGreaterThan(0);
    for (const s of piece.windowsByBars[2][0].steps) {
      expect(validateStep(s.notes).legal).toBe(true);
    }
  });
});

describe('pickPreferredModel', () => {
  it('prefiere el coder (JSON impecable) sobre chat y razonadores', () => {
    const models = [
      { name: 'dolphin-llama3:8b', sizeGb: 4.7 },
      { name: 'qwen2.5-coder:7b', sizeGb: 4.7 },
      { name: 'deepseek-r1:7b', sizeGb: 4.7 },
    ];
    expect(pickPreferredModel(models)).toBe('qwen2.5-coder:7b');
  });

  it('sin conocidos, usa el primero; sin modelos, null', () => {
    expect(pickPreferredModel([{ name: 'mateo-v4:latest', sizeGb: 4.9 }])).toBe('mateo-v4:latest');
    expect(pickPreferredModel([])).toBeNull();
  });
});
