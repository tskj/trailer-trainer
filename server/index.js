// Trailer Trainer leaderboard server.
//
// Anti-cheat model: the client never gets to just claim a time. Every
// submission carries (level, seed, packed tick inputs, claimed metrics); we
// re-run the log through the exact same sim module the client used and store
// OUR computed metrics. The claim only has to land within a small tolerance
// (cross-engine float drift); a tampered time or an impossible input log is
// rejected because the replay simply doesn't produce it.
import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay, unpackCount, SIM_VERSION, MAX_STEER } from '../src/sim.js';
import { LEVELS, levelById } from '../src/levels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL || 'postgresql:///trailer_trainer_dev';

const pool = new pg.Pool({ connectionString: DB_URL, max: 10, connectionTimeoutMillis: 8000 });

await pool.query(`
  CREATE TABLE IF NOT EXISTS runs (
    id          bigserial PRIMARY KEY,
    level       text        NOT NULL,
    name        text        NOT NULL,
    time_ms     integer     NOT NULL,
    dist        integer     NOT NULL,
    sim_version integer     NOT NULL,
    seed        bigint      NOT NULL,
    n_ticks     integer     NOT NULL,
    ticks       jsonb       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS runs_time_idx ON runs (level, sim_version, time_ms);
  CREATE INDEX IF NOT EXISTS runs_dist_idx ON runs (level, sim_version, dist);
`);
console.log(`db ready (${DB_URL.replace(/\/\/[^@]*@/, '//…@')})`);

const app = express();
app.use(express.json({ limit: '3mb' }));

const MAX_TICKS = 72000;          // 10 minutes of run
const BOARD_N = 10;

// best run per name, ranked by one metric. Rows carry the run id so clients
// can fetch that exact run's input log from /api/replay and watch it.
async function board(level, metric){
  const col = metric === 'time' ? 'time_ms' : 'dist';
  const { rows } = await pool.query(
    `SELECT id, name, time_ms AS "timeMs", dist FROM (
       SELECT DISTINCT ON (name) id, name, time_ms, dist FROM runs
       WHERE level=$1 AND sim_version=$2 ORDER BY name, ${col} ASC, created_at ASC
     ) b ORDER BY "${col === 'time_ms' ? 'timeMs' : 'dist'}" ASC LIMIT ${BOARD_N}`,
    [level, SIM_VERSION]);
  return rows.map((r, i) => ({ rank: i + 1, ...r, id: Number(r.id) }));
}
async function rankOf(level, metric, value){
  const col = metric === 'time' ? 'time_ms' : 'dist';
  const { rows } = await pool.query(
    `SELECT 1 + COUNT(*) AS r FROM (
       SELECT name, MIN(${col}) AS best FROM runs
       WHERE level=$1 AND sim_version=$2 GROUP BY name
     ) x WHERE x.best < $3`,
    [level, SIM_VERSION, value]);
  return Number(rows[0].r);
}
async function bestOf(level, name){
  const { rows } = await pool.query(
    `SELECT MIN(time_ms) AS t, MIN(dist) AS d FROM runs
     WHERE level=$1 AND sim_version=$2 AND name=$3`,
    [level, SIM_VERSION, name]);
  return rows[0].t == null ? null : { timeMs: Number(rows[0].t), dist: Number(rows[0].d) };
}

app.get('/api/health', async (_req, res) => {
  try{ await pool.query('SELECT 1'); res.json({ ok: true, v: SIM_VERSION }); }
  catch(e){ res.status(500).json({ ok: false }); }
});

app.get('/api/boards', async (req, res) => {
  const level = String(req.query.level || '');
  if(!levelById(level)) return res.status(400).json({ error: 'unknown level' });
  try{
    const [time, dist] = await Promise.all([board(level, 'time'), board(level, 'dist')]);
    const out = { time, dist };
    const name = String(req.query.name || '').slice(0, 14);
    if(name){
      const best = await bestOf(level, name);
      if(best) out.you = { best,
        rankTime: await rankOf(level, 'time', best.timeMs),
        rankDist: await rankOf(level, 'dist', best.dist) };
    }
    res.json(out);
  }catch(e){ console.error('boards:', e.message); res.status(500).json({ error: 'db' }); }
});

app.get('/api/summary', async (_req, res) => {
  try{
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (level) level, name, time_ms AS "timeMs" FROM runs
       WHERE sim_version=$1 ORDER BY level, time_ms ASC, created_at ASC`, [SIM_VERSION]);
    const { rows: drows } = await pool.query(
      `SELECT DISTINCT ON (level) level, name, dist FROM runs
       WHERE sim_version=$1 ORDER BY level, dist ASC, created_at ASC`, [SIM_VERSION]);
    const levels = {};
    for(const r of rows)  (levels[r.level] ??= {}).bestTime = { name: r.name, timeMs: Number(r.timeMs) };
    for(const r of drows) (levels[r.level] ??= {}).bestDist = { name: r.name, dist: Number(r.dist) };
    res.json({ levels });
  }catch(e){ console.error('summary:', e.message); res.status(500).json({ error: 'db' }); }
});

// one stored run, input log included — everything a client needs to
// re-simulate and watch it (level, seed, packed ticks). Current-sim-version
// only: an old log fed to a newer sim would silently desync.
app.get('/api/replay', async (req, res) => {
  const id = Number(req.query.id || '');
  if(!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad id' });
  try{
    const { rows } = await pool.query(
      `SELECT id, level, name, seed, time_ms AS "timeMs", dist, ticks FROM runs
       WHERE id=$1 AND sim_version=$2`, [id, SIM_VERSION]);
    if(!rows.length) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ id: Number(r.id), level: r.level, name: r.name, seed: Number(r.seed),
               timeMs: r.timeMs, dist: r.dist, ticks: r.ticks });
  }catch(e){ console.error('replay:', e.message); res.status(500).json({ error: 'db' }); }
});

const bad = (res, reason) => res.status(422).json({ ok: false, reason });

app.post('/api/runs', async (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 14) : '';
  if(!name) return bad(res, 'name required');
  if(b.v !== SIM_VERSION) return bad(res, `sim version mismatch (server ${SIM_VERSION})`);
  const level = levelById(String(b.level || ''));
  if(!level || level.id === 'free') return bad(res, 'unknown level');
  const seed = b.seed;
  if(!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) return bad(res, 'bad seed');
  const ticks = b.ticks;
  if(!Array.isArray(ticks) || ticks.length === 0 || ticks.length > 30000) return bad(res, 'bad input log');
  for(const r of ticks){
    if(!Array.isArray(r) || r.length !== 5 || !r.every(Number.isInteger)) return bad(res, 'bad input row');
    const [n, dq, tq, rq, fl] = r;
    if(n < 1 || n > MAX_TICKS) return bad(res, 'bad run length');
    if(Math.abs(dq) > Math.ceil(MAX_STEER * 8192) || tq < 0 || tq > 255 || rq < 0 || rq > 255 || fl < 0 || fl > 3)
      return bad(res, 'input out of range');
  }
  if(unpackCount(ticks) > MAX_TICKS) return bad(res, 'run too long');
  const claim = b.claim || {};
  if(!Number.isInteger(claim.timeMs) || !Number.isInteger(claim.dist) || claim.timeMs < 0 || claim.dist < 0)
    return bad(res, 'bad claim');

  // ---- the actual anti-cheat: re-simulate the run ----
  const t0 = Date.now();
  const rr = replay(level, seed, ticks, MAX_TICKS);
  if(!rr.done) return bad(res, `replay did not finish (${rr.reason})`);
  const tolT = Math.max(50, rr.timeMs * 0.005), tolD = Math.max(2, rr.dist * 0.005);
  if(Math.abs(rr.timeMs - claim.timeMs) > tolT || Math.abs(rr.dist - claim.dist) > tolD)
    return bad(res, `claim mismatch (server got ${rr.timeMs}ms / ${rr.dist})`);

  try{
    await pool.query(
      `INSERT INTO runs (level, name, time_ms, dist, sim_version, seed, n_ticks, ticks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [level.id, name, rr.timeMs, rr.dist, SIM_VERSION, seed, rr.ticks, JSON.stringify(ticks)]);
    const best = await bestOf(level.id, name);
    const [time, dist, rankTime, rankDist] = await Promise.all([
      board(level.id, 'time'), board(level.id, 'dist'),
      rankOf(level.id, 'time', best.timeMs), rankOf(level.id, 'dist', best.dist),
    ]);
    console.log(`run ok: ${level.id} ${name} ${rr.timeMs}ms/${rr.dist} (verify ${Date.now()-t0}ms, ${rr.ticks} ticks)`);
    res.json({ ok: true, timeMs: rr.timeMs, dist: rr.dist, rankTime, rankDist, boards: { time, dist } });
  }catch(e){ console.error('insert:', e.message); res.status(500).json({ ok: false, error: 'db' }); }
});

// production: serve the built client
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'), err => { if(err) res.status(404).end(); }));

app.listen(PORT, () => console.log(`trailer-trainer server on :${PORT}`));
