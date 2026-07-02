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

## 2026-07-01 (noche) — Fase 3 + memoria entre sesiones

**Autores: Usuario (ideas) + Claude (implementación)**

- **Feedback del Usuario tras probar:** suena bien, pero el entrenamiento sube
  rápido, encuentra un sonido y se estanca; pidió que lo que el agente crea se
  guarde en memoria "para que cada vez sea mejor" y poder "borrar viejos".
- **Decisión conjunta:** adelantar la persistencia (que la spec ponía en la
  Fase 5) a esta entrega, en forma de **biblioteca de piezas** + **arranque en
  caliente**.

Fase 3 de la spec:
- **Manos animadas** en el teclado: una sombra por mano que se desliza suavemente
  sobre su alcance mientras suena (rAF con persecución exponencial).
- **Panel de aprendizaje con recharts**: curva best/promedio (con downsampling a
  ≤400 puntos) + desglose de la recompensa del mejor en barras (consonancia,
  ritmo, estructura, contorno, física, entropía; azul positivo / rojo negativo,
  paleta validada contra la superficie oscura con el validador de dataviz).
- **Máquina del tiempo**: el worker guarda una instantánea del mejor cada 50
  generaciones (y la gen 0); un slider permite escuchar cómo sonaba en la
  generación 0 vs ahora. El timeline se ralea si supera 160 snapshots.
- Nuevo `engine/reward-breakdown.ts`: espejo EXACTO de la fórmula del reward.js
  portado usando los mismos helpers, para la UI. Un test de propiedad (50
  genomas) garantiza que su total coincide con musicalReward a 12 decimales —
  si el portado cambiara, el test truena.

Idea del Usuario (memoria):
- **Biblioteca de piezas** en IndexedDB (`storage/library.ts`): botón «💾
  Guardar pieza» guarda el mejor actual; el panel lista, reproduce y borra
  piezas. Sobreviven al recargar la página.
- **Arranque en caliente**: checkbox «Partir de lo aprendido» — hasta media
  población inicial nace de las piezas guardadas (la primera copia de cada
  semilla intacta, el resto mutadas). `TrainConfig.seedGenomes` es opcional;
  el contrato congelado (NoteEvent/Step/Genome) NO se tocó.
- Sobre el estancamiento: es el techo de la Etapa 1 (la heurística tiene un
  máximo alcanzable). El salto real de calidad llega con la Fase 4 (aprender de
  música real) y la Fase 5 (tu gusto ajusta los pesos).

Idea del Usuario (conectar una IA): registrada para evaluar tras la Fase 4. La
"IA que aprende de verdad" del proyecto es la propia Etapa 2 (LSTM en TF.js
sobre MIDI reales, corre local en el navegador). Un LLM local (Ollama, etc.) no
toca piano de forma nativa, pero podría experimentarse como generador de
semillas en notación textual — fase extra opcional, decisión pendiente.

Tests: 61 → 67 (breakdown espejo ×4, arranque en caliente ×2). recharts añadido
(el bundle sube a ~232 KB gzip — aceptable para app local; code-splitting
anotado como mejora de la Fase 6).

## 2026-07-01 (noche) — Segunda revisión adversarial (Fase 3): 4 hallazgos, 4 corregidos

**Autor: Claude.** Los verificadores automáticos agotaron la cuota de la sesión,
así que los 4 hallazgos de los revisores se verificaron A MANO contra el código
antes de corregir (regla: ante la duda, no es bug — los 4 se sostenían):

1. **KeyboardCanvas (major):** la limpieza del efecto cancelaba el
   requestAnimationFrame pero no reseteaba `rafRef` a null — tras el doble
   montaje de StrictMode (React 19 en dev) el canvas quedaba sin redibujar
   para siempre. Corregido.
2. **library.ts:** la promesa se resolvía en `request.onsuccess`, que llega
   ANTES del commit de IndexedDB — un abort al confirmar (cuota llena) sería
   una pérdida silenciosa. Ahora resuelve en `transaction.oncomplete`.
3. **library.ts:** `db.close()` solo corría en `oncomplete`; cada transacción
   fallida filtraba una conexión. Ahora también cierra (y rechaza) en `onabort`.
4. **TrainerControls:** el tempo se clampaba en cada tecla — escribir "85" era
   imposible (el "8" se convertía en 60). Ahora se teclea libre y se valida al
   salir del campo (onBlur).

También: un revisor dejó un archivo temporal de prueba dentro del repo
(`__scratch_review.test.ts`); eliminado antes del commit.
