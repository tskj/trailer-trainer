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
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { replay, unpackCount, SIM_VERSION, MAX_STEER } from '../src/sim.js';
import { LEVELS, levelById, hydrateLevel } from '../src/levels.js';

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
  CREATE TABLE IF NOT EXISTS levels (
    id          text        PRIMARY KEY,
    def         jsonb       NOT NULL,
    name        text        NOT NULL,
    author      text        NOT NULL,
    sim_version integer     NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS levels_recent_idx ON levels (sim_version, created_at DESC);
`);
console.log(`db ready (${DB_URL.replace(/\/\/[^@]*@/, '//…@')})`);

const app = express();
app.use(express.json({ limit: '3mb' }));

const MAX_TICKS = 72000;          // 10 minutes of run
const BOARD_N = 10;

// ------------------------------------------------------------ custom levels
// A custom level is a plain-JSON definition (the editor's save format). Its
// id is a content hash, so identical defs dedupe, ids are unforgeable, and a
// level can never change under its leaderboard. Publishing requires a proof
// run that the server verifies against the posted def — every shared level is
// completable by construction and ships with its author's run on the board.
const FITS = ['trailer', 'car', 'rig'];
const COORD = 20000;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// whitelist-copy: drops junk keys so the stored def (and its hash) contains
// exactly the fields the sim reads
function sanitizeRegion(n){
  if(!n || typeof n !== 'object') return null;
  switch(n.t){
    case 'or': case 'and': return { t: n.t, kids: (Array.isArray(n.kids) ? n.kids : []).map(sanitizeRegion) };
    case 'not':  return { t: 'not', kid: sanitizeRegion(n.kid) };
    case 'half': return { t: 'half', axis: n.axis, at: n.at, sign: n.sign };
    case 'disc': return { t: 'disc', cx: n.cx, cy: n.cy, r: n.r, mode: n.mode };
    case 'quad': { const q = { t: 'quad', ex: n.ex, ey: n.ey, ccx: n.ccx, ccy: n.ccy, r: n.r, mode: n.mode };
      if(n.n !== undefined) q.n = n.n; if(n.flipx) q.flipx = true; if(n.flipy) q.flipy = true; return q; }
    case 'cone': { const c = { t: 'cone', x: n.x, y: n.y }; if(n.r !== undefined) c.r = n.r; return c; }
    default: return null;
  }
}
function sanitizeDef(d){
  if(!d || typeof d !== 'object') return null;
  return {
    name: typeof d.name === 'string' ? d.name.trim().slice(0, 40) : '',
    goal: typeof d.goal === 'string' ? d.goal.trim().slice(0, 140) : '',
    start: d.start && { x: d.start.x, y: d.start.y, th: d.start.th },
    bay: d.bay && { x: d.bay.x, y: d.bay.y, ang: d.bay.ang, fit: d.bay.fit },
    obstacles: Array.isArray(d.obstacles) ? d.obstacles.map(sanitizeRegion) : null,
  };
}
function validateRegion(node, budget, depth){
  if(depth > 5) return 'regions nested too deep';
  if(!node || typeof node !== 'object') return 'bad region node';
  if(++budget.n > 200) return 'too many region nodes';
  switch(node.t){
    case 'or': case 'and':
      if(!Array.isArray(node.kids) || node.kids.length < 1 || node.kids.length > 24) return 'bad kids';
      for(const k of node.kids){ const e = validateRegion(k, budget, depth + 1); if(e) return e; }
      return null;
    case 'not': return validateRegion(node.kid, budget, depth + 1);
    case 'half':
      if(node.axis !== 'x' && node.axis !== 'y') return 'bad half axis';
      if(node.sign !== 1 && node.sign !== -1) return 'bad half sign';
      return num(node.at, -COORD, COORD) ? null : 'bad half position';
    case 'disc':
      if(!num(node.cx, -COORD, COORD) || !num(node.cy, -COORD, COORD)) return 'bad disc centre';
      if(!num(node.r, 20, 6000)) return 'disc radius out of range';       // ≥20: no thin slivers
      return node.mode === 'in' || node.mode === 'out' ? null : 'bad disc mode';
    case 'quad':
      if(!num(node.ex, -COORD, COORD) || !num(node.ey, -COORD, COORD) ||
         !num(node.ccx, -COORD, COORD) || !num(node.ccy, -COORD, COORD)) return 'bad quad coords';
      if(!num(node.r, 25, 6000)) return 'quad radius out of range';
      if(node.n !== undefined && !num(node.n, 2, 12)) return 'bad quad exponent';
      return node.mode === 'in' || node.mode === 'out' ? null : 'bad quad mode';
    default: return 'unknown region type';
  }
}
function validateDef(def){
  if(!def) return 'no level definition';
  if(!def.name) return 'level needs a name';
  const s = def.start;
  if(!s || !num(s.x, -COORD, COORD) || !num(s.y, -COORD, COORD) || !num(s.th, -7, 7)) return 'bad start';
  const b = def.bay;
  if(!b || !num(b.x, -COORD, COORD) || !num(b.y, -COORD, COORD) || !num(b.ang, -7, 7) || !FITS.includes(b.fit)) return 'bad bay';
  if(!def.obstacles || def.obstacles.length > 160) return 'bad obstacles';
  const budget = { n: 0 };
  let cones = 0;
  for(const o of def.obstacles){
    if(o && o.t === 'cone'){
      if(++cones > 128) return 'too many cones';
      if(!num(o.x, -COORD, COORD) || !num(o.y, -COORD, COORD)) return 'bad cone';
      if(o.r !== undefined && !num(o.r, 6, 30)) return 'bad cone radius';
    } else {
      const e = validateRegion(o, budget, 0); if(e) return e;
    }
  }
  if(JSON.stringify(def).length > 32768) return 'level too large';
  return null;
}
// canonical stringify (sorted keys) so the content hash is key-order-independent
const canon = v => Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',')}}`
  : JSON.stringify(v);
const defId = def => 'c_' + createHash('sha256').update(canon(def)).digest('hex').slice(0, 12);
const CUSTOM_ID = /^c_[0-9a-f]{12}$/;

// built-in or stored custom level; customs are immutable (content-hashed), so cache hard
const customCache = new Map();
async function getLevel(id){
  const builtin = levelById(id); if(builtin) return builtin;
  if(!CUSTOM_ID.test(id)) return null;
  if(customCache.has(id)) return customCache.get(id);
  const { rows } = await pool.query('SELECT def FROM levels WHERE id=$1 AND sim_version=$2', [id, SIM_VERSION]);
  if(!rows.length) return null;
  const lv = hydrateLevel(rows[0].def, id);
  if(customCache.size > 500) customCache.clear();
  customCache.set(id, lv);
  return lv;
}

// (seed, packed ticks, claim) shape check — shared by run submission and the
// publish proof run
function checkRunShape(seed, ticks, claim){
  if(!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) return 'bad seed';
  if(!Array.isArray(ticks) || ticks.length === 0 || ticks.length > 30000) return 'bad input log';
  for(const r of ticks){
    if(!Array.isArray(r) || r.length !== 5 || !r.every(Number.isInteger)) return 'bad input row';
    const [n, dq, tq, rq, fl] = r;
    if(n < 1 || n > MAX_TICKS) return 'bad run length';
    if(Math.abs(dq) > Math.ceil(MAX_STEER * 8192) || tq < 0 || tq > 255 || rq < 0 || rq > 255 || fl < 0 || fl > 3)
      return 'input out of range';
  }
  if(unpackCount(ticks) > MAX_TICKS) return 'run too long';
  if(!claim || !Number.isInteger(claim.timeMs) || !Number.isInteger(claim.dist) || claim.timeMs < 0 || claim.dist < 0)
    return 'bad claim';
  return null;
}

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
  if(!(await getLevel(level).catch(() => null))) return res.status(400).json({ error: 'unknown level' });
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

// publish a custom level. Requires a proof run that finishes on the posted
// def — verified with the same replay pipeline as leaderboard submissions —
// so junk/unbeatable levels can't be shared, and every published level opens
// with its author's verified run on the board (which is also the first ghost).
app.post('/api/levels', async (req, res) => {
  const b = req.body || {};
  const author = typeof b.author === 'string' ? b.author.trim().slice(0, 14) : '';
  if(!author) return bad(res, 'author name required');
  if(b.v !== SIM_VERSION) return bad(res, `sim version mismatch (server ${SIM_VERSION})`);
  const def = sanitizeDef(b.def);
  const defErr = validateDef(def);
  if(defErr) return bad(res, defErr);
  const run = b.run || {};
  const shapeErr = checkRunShape(run.seed, run.ticks, run.claim || {});
  if(shapeErr) return bad(res, `proof run: ${shapeErr}`);

  const id = defId(def);
  const level = hydrateLevel(def, id);
  const t0 = Date.now();
  const rr = replay(level, run.seed, run.ticks, MAX_TICKS);
  if(!rr.done) return bad(res, `proof run did not finish (${rr.reason})`);
  const tolT = Math.max(50, rr.timeMs * 0.005), tolD = Math.max(2, rr.dist * 0.005);
  if(Math.abs(rr.timeMs - run.claim.timeMs) > tolT || Math.abs(rr.dist - run.claim.dist) > tolD)
    return bad(res, `proof run claim mismatch (server got ${rr.timeMs}ms / ${rr.dist})`);

  try{
    await pool.query(
      `INSERT INTO levels (id, def, name, author, sim_version)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(def), def.name, author, SIM_VERSION]);
    await pool.query(
      `INSERT INTO runs (level, name, time_ms, dist, sim_version, seed, n_ticks, ticks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, author, rr.timeMs, rr.dist, SIM_VERSION, run.seed, rr.ticks, JSON.stringify(run.ticks)]);
    console.log(`level published: ${id} "${def.name}" by ${author} (proof ${rr.timeMs}ms/${rr.dist}, verify ${Date.now()-t0}ms)`);
    res.json({ ok: true, id, timeMs: rr.timeMs, dist: rr.dist });
  }catch(e){ console.error('publish:', e.message); res.status(500).json({ ok: false, error: 'db' }); }
});

// fetch one custom level def, or (without id) list recent community levels
app.get('/api/levels', async (req, res) => {
  const id = String(req.query.id || '');
  try{
    if(id){
      if(!CUSTOM_ID.test(id)) return res.status(400).json({ error: 'bad id' });
      const { rows } = await pool.query(
        'SELECT def, name, author, created_at AS "createdAt" FROM levels WHERE id=$1 AND sim_version=$2', [id, SIM_VERSION]);
      if(!rows.length) return res.status(404).json({ error: 'not found' });
      return res.json({ id, ...rows[0] });
    }
    const { rows } = await pool.query(
      `SELECT id, name, author, created_at AS "createdAt" FROM levels
       WHERE sim_version=$1 ORDER BY created_at DESC LIMIT 30`, [SIM_VERSION]);
    const ids = rows.map(r => r.id);
    const wr = {};
    if(ids.length){
      const { rows: wrs } = await pool.query(
        `SELECT DISTINCT ON (level) level, name, time_ms AS "timeMs" FROM runs
         WHERE sim_version=$1 AND level = ANY($2) ORDER BY level, time_ms ASC, created_at ASC`, [SIM_VERSION, ids]);
      for(const w of wrs) wr[w.level] = { name: w.name, timeMs: Number(w.timeMs) };
    }
    res.json({ levels: rows.map(r => ({ ...r, wr: wr[r.id] || null })) });
  }catch(e){ console.error('levels:', e.message); res.status(500).json({ error: 'db' }); }
});

app.post('/api/runs', async (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 14) : '';
  if(!name) return bad(res, 'name required');
  if(b.v !== SIM_VERSION) return bad(res, `sim version mismatch (server ${SIM_VERSION})`);
  const level = await getLevel(String(b.level || '')).catch(() => null);
  if(!level || level.id === 'free') return bad(res, 'unknown level');
  const seed = b.seed, ticks = b.ticks, claim = b.claim || {};
  const shapeErr = checkRunShape(seed, ticks, claim);
  if(shapeErr) return bad(res, shapeErr);

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
