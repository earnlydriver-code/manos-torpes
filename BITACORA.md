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
