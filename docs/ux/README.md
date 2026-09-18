# UX docs

What the client sees and how it behaves. Owned by the ux agent.

| Doc | Read it when |
|---|---|
| `design.md` | always, before changing or reviewing anything the client sees: principles, tokens, type, layout, motion, icons, behaviour rules, copy, what not to do |
| `components.md` | you build or review a screen: the shared parts and where they live in the app |
| `screens/questionnaire.md` | you touch a question screen, a chapter opener or the contents |
| `screens/plans.md` | you touch the plans step (`/planuri`) |
| `screens/drawing.md` | you touch the drawing editor (`/deseneaza`) or the screens after it (ceiling height, landmarks) |
| `mockups/` | a ticket or screen doc points at one: self-contained HTML, open it in a browser. `mockups/drawing/drawing-editor.html` is the settled design of the drawing experience and the visual source of truth for tool screens |

The language is general and holds for every flow; a screen doc says only what is particular to
its screens and points back to the language. A ticket in `docs/backlog/` is the spec for a change
until it is built; then the screen doc describes the result.

The questionnaire's original mockups and copy document live next to the app:
`apps/input-capture-web/urban-moon-screens(1).html`, `urban-moon-motion.html`,
`COPY-chestionar(1).md`.
