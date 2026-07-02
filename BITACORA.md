# Bitácora — Manos Torpes 🎹

Registro cronológico de decisiones y cambios del proyecto. **Regla de la casa:** todo cambio
de rumbo, decisión de diseño o desviación de la spec se anota aquí con autor, fecha y porqué.
Este proyecto es una colaboración entre el Usuario y Claude — ambos con voz y voto.

---

## 2026-07-01 — Fundación del proyecto

**Autores: Usuario + Claude**

- El Usuario aportó la spec completa ("SPEC — Manos Torpes: una IA que aprende a tocar piano
  desde cero", PDF de 8 páginas). Es la fuente de verdad del proyecto.
- **Decisión (Usuario):** alcance de la primera entrega = Fases 0–2 de la spec (scaffold +
  física de manos con tests + entrenamiento genético audible).
- **Decisión (Usuario delegó, Claude eligió):** TypeScript para la app. El código de
  referencia de la spec (`hand-physics.js`, `reward.js`) se porta como `.js` **sin tocar su
  lógica**, con archivos `.d.ts` hermanos para tipado.
- **Decisión (Usuario):** el proyecto vive en `C:\dev\manos-torpes`, fuera de OneDrive
  (evita problemas de sync con node_modules). En la carpeta original del Escritorio queda un
  LEEME.txt apuntando aquí.
- **Discusión (Usuario preguntó, Claude argumentó, Usuario aceptó):** ¿web o Python local?
  Se queda web como dice la spec. Motivo: todo corre local en el navegador igualmente; el ML
  de este proyecto es pequeño por diseño (genético + LSTM <100k params) y no gana nada con
  Python; el audio en tiempo real (Tone.js + Salamander Grand) y la UI Canvas son muy
  superiores en el navegador.

**Cambios de Claude en esta sesión:**
- Scaffold Vite + React + TypeScript (template oficial `react-ts`, Vite 8 / React 19 / TS 6).
- Git inicializado, primer commit del template puro.

## 2026-07-01 — Fases 0–2 completas (primera entrega)

**Autor: Claude** (plan aprobado por el Usuario)

- **Contrato de datos congelado** en `src/types/music.ts` (spec §9.3).
- **Código de referencia portado tal cual**: `hand-physics.js` y `reward.js`.
  - Adición sancionada en `hand-physics.js`: `export` de las constantes al final
    (sin tocar lógica) para no duplicarlas en el resto del motor.
  - Adición sancionada en `reward.js`: las líneas de `import` de los helpers
    (el esqueleto de la spec los asume en scope).
- **Corrección al plan (manda el código portado):** el plan decía
  `travelCost(60,65)=1.5`; el código portado redondea con `Math.ceil` a pasos
  enteros de semicorchea ⇒ `2`. Los tests siguen al código.
- **Decisión de implementación:** `ngramSelfSimilarity` opera sobre n-gramas de
  NOTAS (eventos de onset), no de pasos de reloj — la spec dice "n-gramas de
  notas" y con negras las ventanas de 4 semicorcheas quedaban siempre vacías.
- **Decisión de implementación:** las reglas ENTRE manos (≤10 notas, no
  atravesarse ±3 st) viven en `step-validator.ts` porque `validateHandShape`
  portado valida una sola mano.
- **Interpretación de la spec §6:** el slider de velocidad 1x–50x regula las
  generaciones/segundo del worker ("entrenando en silencio y sonando solo el
  mejor") — no la velocidad de reproducción del audio.
- **Motor genético** (población 64, torneo k=3, crossover en frontera de compás,
  elitismo 6): el benchmark falló 2 veces por escala débil (0.44, 0.52 < 0.6) y
  se iteró SOLO sobre operadores de mutación (regla del plan): pasos diatónicos
  sobre la escala detectada del genoma, transposición diatónica de compases,
  ancla tonal (tónica/quinta en el beat), registro por octavas/quintas.
- **Criterio de éxito de la spec §7 CUMPLIDO:** 2000 generaciones en 19 s
  (límite 120 s), best=0.814, pulso=0.775, escala=0.732, 100% físicamente legal.
  Reproducible con semilla 20260701 (`npm run bench`).
- Suite de 56 tests (`npm test`) + benchmark aparte (`npm run bench`).
- App completa: teclado Canvas 61 teclas clickeable con Salamander Grand,
  entrenamiento en Web Worker (la UI nunca se congela), curva best/avg en vivo,
  reproducción del mejor con colores por mano y números de dedo.
- Revisión adversarial multi-agente del motor lanzada al final de la sesión;
  hallazgos confirmados se corrigen y anotan aquí.

## 2026-07-01 — Revisión adversarial: 8 hallazgos, 6 corregidos

**Autor: Claude** (revisión con 12 agentes: 4 revisores por dimensión + verificadores escépticos)

Confirmados por verificador independiente y corregidos:
1. **Worker (major):** el freno de velocidad dormía hasta 12.5 s de un tirón —
   el contador saltaba de 25 en 25 y los comandos (velocidad, reset) no surtían
   efecto hasta que expiraba el sueño. Ahora: tandas pequeñas (~10/s) y sueño
   troceado en ≤100 ms re-chequeando estado.
2. **Hook useTrainer (major):** un `progress`/`newBest` en vuelo tras Reset
   repoblaba el estado recién limpiado (podía dejar "Reproducir mejor" apuntando
   a un genoma descartado). Ahora cada corrida lleva `runId` y los mensajes de
   corridas viejas se descartan.
3. **Audio (minor):** Detener no cortaba las notas ya disparadas (los releases
   van en tiempo absoluto del AudioContext, no en el Transport). Ahora
   `stopPlayback` llama `sampler.releaseAll()`.
4. **Teclado (minor):** un solo estado de tecla presionada dejaba notas
   atascadas con multi-touch. Ahora un mapa puntero→tecla (pointerId).

Válidos conceptualmente (los verificadores se quedaron sin cuota, verificados a mano) y corregidos:
5. **repairGenome borraba material legal:** usaba "nota más aguda = posición de
   la mano", así que mover un dedo DENTRO del alcance contaba como viaje. Ahora
   propaga el INTERVALO factible de anchors (una nota sola no determina dónde
   está la mano) y solo declara viaje cuando el onset cae fuera de todo el
   intervalo. `travelPenalty` usa la misma semántica (coherencia motor↔recompensa).
6. **Las notas sostenidas eran invisibles para la física:** una mano podía
   "sostener" una tecla y a la vez tocar a 14 semitonos. Ahora la reparación
   modela los sostenidos: dedo/tecla ocupados, forma combinada legal y soltar
   antes de viajar (truncando duraciones — menos destructivo que borrar).
   `randomGenome` también pasa por repair (los frescos cumplen el invariante).
7. **Al pausar, el gen mostrado quedaba desactualizado** (el mensaje `paused`
   se ignoraba): ahora sincroniza el contador.

Refutados por los verificadores (no eran bugs): 1 hallazgo de fidelidad del
port y variantes duplicadas de los anteriores.

Tests nuevos: sostenidos (2), anchor-ventana, idempotencia de repair (punto
fijo), invariante físico del mejor tras 100 generaciones. Total: **61 tests + bench**.
Bench tras el endurecimiento físico: 2000 gens en 30 s, best=0.800, pulso=0.766,
escala=0.725 — y el mejor individuo pasó de ~20 a ~47 notas (la reparación ya
no destruye material legal).

**Pendiente (fases futuras de la spec):** Fase 3 (manos animadas, recharts,
timeline de generaciones), Fase 4 (corpus MIDI/MP3 + Etapa 2), Fase 5 (feedback
humano 👍/👎 + IndexedDB + export del cerebro), Fase 6 (pulido + modo dueto).
