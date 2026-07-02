# Trailer Trainer

Top-down towing game: back a trailer into bays against the clock, compete on
global leaderboards. Live at **https://trailer-trainer.up.railway.app**.

## How it works

- **Client** (`index.html`, `src/main.js`, `src/render3d.js`): Three.js renderer +
  TrackMania-style flow. Space restarts, Enter advances, Tab opens levels,
  digits jump. Driver name is picked once (localStorage).
- **Deterministic sim** (`src/sim.js`, `src/levels.js`): pure modules shared by
  browser and server. Fixed 120 Hz ticks / 240 Hz substeps, seeded PRNG
  (mulberry32), quantized per-tick inputs (RLE-packed). Same (level, seed,
  inputs) ⇒ bit-identical run on any V8.
- **Anti-cheat** (`server/index.js`): every submission carries the full input
  log; the server re-simulates it and stores *its own* computed time/distance.
  Tampered claims and input logs that don't actually finish are rejected
  (tolerance exists for cross-engine float drift, but V8↔V8 replays match
  exactly). Bump `SIM_VERSION` in `src/sim.js` whenever physics/levels change —
  boards are per-version.
- **Two boards per level**: fastest time and shortest distance, best run per
  driver name. Names are honor-system (PoC).

## Dev

```sh
npm install
createdb trailer_trainer_dev   # local postgres, socket auth
npm run dev:server             # API on :3210 (bootstraps schema)
npm run dev                    # vite on :5173, proxies /api -> :3210
```

Useful debug hooks on `window`: `__tt()` telemetry, `__run()` current run,
`__feed(seed, packedTicks)` replay injection, `__setName(n)`, `__audio()`,
`__camZoom` camera dolly. `scripts/*.mjs` are headless playwright helpers
(SwiftShader runs ~40% real-time; prefer condition-driven waits).

## Deploy (Railway)

Project `trailer-trainer` (Postgres + `app` service, Dockerfile build,
healthcheck `/api/health`, `DATABASE_URL` referenced from the Postgres
service). Deploy from the repo root:

```sh
railway up --service app --detach
```

GitHub Pages (`.github/workflows/deploy.yml`) still publishes a client-only
build where leaderboards gracefully hide.
