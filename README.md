# Trailer Trainer

Top-down towing game: back a trailer into bays against the clock, compete on
global leaderboards. Live at **https://trailer-trainer.up.railway.app**.

## How it works

- **Client** (`index.html`, `src/main.js`, `src/render3d.js`): Three.js renderer +
  TrackMania-style flow. Space restarts, Enter advances, Tab opens levels,
  digits jump. Driver name is picked once (localStorage). The level select is
  a leaderboard browser: hover/arrow a level to see both boards, click any
  entry to watch that run re-simulated in-engine. `G` toggles ghost racing —
  the level's WR replays as a translucent rig in lockstep with your run.
- **Deterministic sim** (`src/sim.js`, `src/levels.js`): pure modules shared by
  browser and server. Fixed 120 Hz ticks / 240 Hz substeps, seeded PRNG
  (mulberry32), quantized per-tick inputs (RLE-packed). Same (level, seed,
  inputs) ⇒ bit-identical run on any V8.
- **Anti-cheat** (`server/index.js`): every submission carries the full input
  log; the server re-simulates it and stores *its own* computed time/distance.
  Tampered claims and input logs that don't actually finish are rejected
  (tolerance exists for cross-engine float drift, but V8↔V8 replays match
  exactly). Stored logs are served back via `/api/replay?id=` for the replay
  viewer and ghosts. Bump `SIM_VERSION` in `src/sim.js` whenever physics/levels
  change — boards (and replay availability) are per-version.
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
`__feed(seed, packedTicks)` replay injection, `__watch(runId)` + `__watchState()`
spectating, `__ghost()` + `__setGhosts(v)` ghost racing, `__setName(n)`,
`__audio()`, `__camZoom` camera dolly. `scripts/*.mjs` are headless playwright helpers
(SwiftShader runs ~40% real-time; prefer condition-driven waits).

## Deploy (Railway)

Project `trailer-trainer` (Postgres + `app` service, Dockerfile build,
healthcheck `/api/health`, `DATABASE_URL` referenced from the Postgres
service). The `app` service is connected to this repo's `main` branch —
**every push to main auto-deploys** via Railway's GitHub integration (no
GitHub Actions involved). For a one-off deploy of uncommitted work:

```sh
railway up --service app --detach
```

GitHub Pages (`.github/workflows/deploy.yml`) still publishes a client-only
build where leaderboards gracefully hide.
