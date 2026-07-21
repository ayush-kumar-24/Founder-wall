# founder wall — exploration prototype v0.1

A digital monument. Not a website.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 — then wait. The darkness is doing work.

## What's inside the experience

- **The entrance** — no loader, no logo. Darkness with one ember
  (a distant lit note), then the room blooms like a sunrise (~4.5s).
- **The room** — stone floor, plaster walls in shadow, warm 2700K light
  with no visible source, an amber glow at the wall's base, drifting dust.
- **The wall** — 11m wide, concave (cupped hands, not a table), aged ivory
  plaster: lime-wash mottling, trowel arcs, hairline cracks, old water
  stains, all procedurally generated. Warm, matte, imperfect. One permanent
  crack at sternum height. ~300 notes in drifts and clearings, each casting
  a real shadow against the light surface.
- **The notes** — aged palette (ochre, sage, blush, ivory, faded sky, ash).
  No two share an exact hue. Older notes lean and curl harder. Every note
  is a readable artifact: from distance the wall is color and density;
  as you approach (~5m → 3m) handwriting emerges; at reading distance
  each note carries fibers, a folded corner with its cast shadow, and
  pencil grain. Individual per-note textures, tiered (224px → 512px),
  generated a few per frame and swapped as identical content at higher
  resolution — focus arriving, never popping. No giant atlas.
  Hover a note and it lifts ~1mm with a breath more light — an invitation.
  Each note carries a quiet identity mark at its bottom edge — "Founder •
  SaaS", "Anonymous Founder", "Founder #1842" — human without identifying.
- **The breeze** — notes near your cursor answer like paper in moving air:
  a slight tilt away from your hand, a corner flutter, shifting shadow,
  then a smooth return to rest. Only nearby notes react. Nothing dramatic.
- **Reading a note** — click it. The note lifts off the wall, comes toward
  you, and scales to comfortable reading size while nearby notes recede
  slightly. No modal, no popup, no card — the reading happens on the wall.
  Click anywhere else and it settles back with the weight of real paper.
- **The camera** — a museum visitor. Drag to walk along the wall (left,
  right, up, down — 1:1 in world space, heavy trolley inertia). Scroll or
  pinch to come closer or step back. Breathing (8mm / ~4s) and drift fade
  to zero as you approach: at reading distance the camera is perfectly
  stable. The wall never fights the visitor.
- **Ambient life** — one note somewhere flutters every 4–9 seconds. Never
  two at once. Never rhythmic. At ~38s a stranger's note arrives from far
  across the wall. Unannounced.
- **The "+"** — a small paper tag, low in the frame, no label. Click it.
- **Writing** — the room darkens over ~2s. One blank note floats in a pool
  of private light. Type: your words appear as pencil on the paper itself.
  A whisper appears: *press enter to place it on the wall.* (Esc returns.)
- **The flight** — the note rises and squares to camera (0.9s), holds
  (0.7s — the emotional payload), then arcs to the wall over 2.2s. It
  doesn't spin. It drifts. It knows where it's going.
- **Contact** — neighbors shuffle a few millimeters, a ripple crosses the
  local field, the whole wall performs one collective breath (1mm, once),
  and then: stillness. No confetti. No "Success!" The absence of
  celebration is the celebration.

## The four easings

`sunrise` (light, camera) · `paper settle` (notes, +2% overshoot)
· `breath` (ambience) · `throw` (the flight). There is no fifth.

Prototype only: no backend, no auth, everything mocked, refactor later.
