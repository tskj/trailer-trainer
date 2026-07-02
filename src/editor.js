// Level editor: mouse-driven, top-down. Owns a level *definition* (the plain
// JSON that gets published) and renders it live through the game renderer.
// Tools place primitives that compile to the sim's CSG region language:
//   edge   -> {t:'half'}                    infinite wall
//   block  -> {t:'and', kids:[4 halfs]}     finite rectangle
//   disc   -> {t:'disc', mode:'in'|'out'}   circle island / arena fence
//   corner -> {t:'quad'}                    infinite quadrant, superellipse fillet
// Minimum sizes are enforced at creation time (no thin slivers); the real
// playability gate is the publish-side proof run.
import { hydrateLevel } from './levels.js';

const SNAP = 5, MIN_BLOCK = 30, MIN_DISC = 25, MIN_CORNER = 30;
const snap = v => Math.round(v / SNAP) * SNAP;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
const DEG15 = Math.PI / 12;
const LS_DRAFT = 'tt.editorDraft';

const BLANK = () => ({
  name: '', goal: '',
  start: { x: 0, y: 220, th: -Math.PI / 2 },
  bay:   { x: 0, y: -160, ang: Math.PI / 2, fit: 'trailer' },
  obstacles: [],
});

// world position of a region's grab handle
function regionHandle(o, cam){
  if(o.t === 'half') return o.axis === 'x' ? { x: o.at, y: cam.y } : { x: cam.x, y: o.at };
  if(o.t === 'disc') return { x: o.cx, y: o.cy };
  if(o.t === 'quad') return { x: o.flipx ? -o.ccx : o.ccx, y: o.flipy ? -o.ccy : o.ccy };
  if(o.t === 'and'){ const r = rectOf(o); return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : { x: 0, y: 0 }; }
  return { x: 0, y: 0 };
}
function rectOf(o){
  let x0 = null, x1 = null, y0 = null, y1 = null;
  for(const k of o.kids || []){
    if(!k || k.t !== 'half') return null;
    if(k.axis === 'x'){ if(k.sign === 1) x0 = k.at; else x1 = k.at; }
    else { if(k.sign === 1) y0 = k.at; else y1 = k.at; }
  }
  return [x0, x1, y0, y1].some(v => v === null) ? null : { x0, x1, y0, y1 };
}
const mkBlock = (x0, y0, x1, y1) => ({ t: 'and', kids: [
  { t: 'half', axis: 'x', at: x0, sign: 1 }, { t: 'half', axis: 'x', at: x1, sign: -1 },
  { t: 'half', axis: 'y', at: y0, sign: 1 }, { t: 'half', axis: 'y', at: y1, sign: -1 },
]});

export function createEditor(ctx){
  // ctx: { R, surface, gizmos, onDefChanged, onTest, onPublish, onPlayPublished, onExit, getRemixSource }
  const { R } = ctx;
  const $ = id => document.getElementById(id);
  const EMPTY_TRAILS = { front: [], rear: [], trailer: [] };

  let def = BLANK();
  try{ const d = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); if(d && d.start && d.bay && Array.isArray(d.obstacles)) def = d; }catch(e){}
  let tool = 'select', sel = null;              // sel: {kind:'cone'|'region'|'bay'|'start', i?}
  let cam = { x: 0, y: 0 }, dolly = 1;
  let drag = null, dirty = true, undoStack = [];
  let published = null;                          // {id, url} of the last publish

  // ---------------------------------------------------------------- def ops
  const defJson = () => JSON.stringify(def);
  function pushUndo(){ undoStack.push(defJson()); if(undoStack.length > 60) undoStack.shift(); }
  function undo(){ const j = undoStack.pop(); if(!j) return; def = JSON.parse(j); sel = null; mutated(false); }
  function mutated(pushHistory = false){          // eslint-disable-line default-param-last
    if(pushHistory) pushUndo();
    dirty = true; published = null;
    try{ localStorage.setItem(LS_DRAFT, defJson()); }catch(e){}
    ctx.onDefChanged();
    renderParams(); syncTopUI();
  }
  function hydrated(){
    const lv = hydrateLevel(JSON.parse(defJson()), '__editing');
    lv.name = def.name || 'untitled';
    return lv;
  }
  function rebuild(){
    const lv = hydrated();
    R.buildLevel(lv, lv.bay ? { hl: lv.bay.hl, hw: lv.bay.hw } : null);
    dirty = false;
  }

  // ---------------------------------------------------------------- frame
  function frame(){
    if(dirty) rebuild();
    const s = def.start;
    R.update(
      { x: s.x, y: s.y, theta: s.th, phi: s.th, delta: 0, v: 0, pitch: 0, roll: 0, trRoll: 0 },
      { camX: cam.x, camY: cam.y, camRot: 0, camLook: 0, rotateFollow: false, dolly,
        bayColor: '#ffc233', bayEdge: '#ffb01a', trails: EMPTY_TRAILS, trailsOn: false });
    R.updateGhost(null);
    positionGizmos();
  }

  // ---------------------------------------------------------------- gizmos
  function handleList(){
    const H = def.obstacles.map((o, i) =>
      o.t === 'cone' ? { x: o.x, y: o.y, kind: 'cone', i } : { ...regionHandle(o, cam), kind: 'region', i });
    H.push({ x: def.bay.x, y: def.bay.y, kind: 'bay' });
    H.push({ x: def.start.x, y: def.start.y, kind: 'start' });
    return H;
  }
  function positionGizmos(){
    const box = ctx.gizmos;
    const H = handleList();
    while(box.children.length < H.length) { const d = document.createElement('div'); d.className = 'ed-handle'; box.appendChild(d); }
    while(box.children.length > H.length) box.removeChild(box.lastChild);
    H.forEach((h, k) => {
      const el = box.children[k];
      const p = R.project(h.x, h.y);
      el.style.display = p.visible ? '' : 'none';
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
      const isSel = sel && ((sel.kind === h.kind && sel.i === h.i) || (sel.kind === h.kind && h.i === undefined));
      el.className = 'ed-handle ' + h.kind + (isSel ? ' sel' : '');
      el.textContent = h.kind === 'bay' ? 'B' : h.kind === 'start' ? 'S' : '';
    });
  }

  // ---------------------------------------------------------------- hit test
  function hitTest(w){
    const tol = 14 * dolly + 6;
    for(let i = def.obstacles.length - 1; i >= 0; i--){
      const o = def.obstacles[i];
      if(o.t === 'cone' && Math.hypot(w.x - o.x, w.y - o.y) < Math.max(tol * 0.8, (o.r || 10) + 6)) return { kind: 'cone', i };
    }
    if(Math.hypot(w.x - def.bay.x, w.y - def.bay.y) < tol * 1.3) return { kind: 'bay' };
    if(Math.hypot(w.x - def.start.x, w.y - def.start.y) < tol * 1.3) return { kind: 'start' };
    for(let i = def.obstacles.length - 1; i >= 0; i--){
      const o = def.obstacles[i];
      if(o.t === 'half'){ if(Math.abs((o.axis === 'x' ? w.x : w.y) - o.at) < tol * 0.7) return { kind: 'region', i }; }
      else if(o.t === 'disc'){
        const d = Math.hypot(w.x - o.cx, w.y - o.cy);
        if(Math.abs(d - o.r) < tol) return { kind: 'region', i, part: 'radius' };
        if(d < tol * 1.2) return { kind: 'region', i };
      }
      else if(o.t === 'and'){ const r = rectOf(o); if(r && w.x > r.x0 - tol/2 && w.x < r.x1 + tol/2 && w.y > r.y0 - tol/2 && w.y < r.y1 + tol/2) return { kind: 'region', i }; }
      else if(o.t === 'quad'){ const h = regionHandle(o, cam); if(Math.hypot(w.x - h.x, w.y - h.y) < tol * 1.5) return { kind: 'region', i }; }
    }
    return null;
  }

  // ---------------------------------------------------------------- pointer
  const surf = ctx.surface;
  function evWorld(e){ const r = surf.getBoundingClientRect(); return R.unproject(e.clientX - r.left, e.clientY - r.top); }

  surf.addEventListener('contextmenu', e => e.preventDefault());
  surf.addEventListener('wheel', e => {
    e.preventDefault();
    dolly = clamp(dolly * Math.exp(e.deltaY * 0.0012), 0.35, 5);
  }, { passive: false });

  surf.addEventListener('pointerdown', e => {
    surf.setPointerCapture(e.pointerId);
    const w = evWorld(e);
    if(tool === 'select'){
      const hit = hitTest(w);
      if(hit){
        sel = hit; renderParams();
        pushUndo();
        drag = { mode: 'move', part: hit.part, w0: w, snap0: JSON.stringify(selNode() ?? (hit.kind === 'bay' ? def.bay : def.start)) };
      } else {
        sel = null; renderParams();
        drag = { mode: 'pan', cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY };
      }
    } else if(tool === 'cone'){
      pushUndo();
      def.obstacles.push({ t: 'cone', x: snap(w.x), y: snap(w.y) });
      sel = { kind: 'cone', i: def.obstacles.length - 1 };
      drag = { mode: 'move', w0: w, snap0: JSON.stringify(selNode()) };
      mutated();
    } else if(tool === 'edge'){
      pushUndo();
      const side = $('edEdgeSide').value;   // 'x+','x-','y+','y-'
      const axis = side[0], sign = side[1] === '+' ? 1 : -1;
      def.obstacles.push({ t: 'half', axis, at: snap(axis === 'x' ? w.x : w.y), sign });
      sel = { kind: 'region', i: def.obstacles.length - 1 };
      drag = { mode: 'move', w0: w, snap0: JSON.stringify(selNode()) };
      mutated();
    } else if(tool === 'block'){
      pushUndo();
      drag = { mode: 'block', x0: snap(w.x), y0: snap(w.y) };
      def.obstacles.push(mkBlock(drag.x0, drag.y0, drag.x0 + MIN_BLOCK, drag.y0 + MIN_BLOCK));
      sel = { kind: 'region', i: def.obstacles.length - 1 };
      mutated();
    } else if(tool === 'disc'){
      pushUndo();
      def.obstacles.push({ t: 'disc', cx: snap(w.x), cy: snap(w.y), r: 60, mode: $('edDiscOut').checked ? 'out' : 'in' });
      sel = { kind: 'region', i: def.obstacles.length - 1 };
      drag = { mode: 'discR' };
      mutated();
    } else if(tool === 'corner'){
      pushUndo();
      const [fx, fy] = JSON.parse($('edCornerDir').value);   // [flipx, flipy]
      const r = 120;
      const q = { t: 'quad', ccx: 0, ccy: 0, ex: 0, ey: 0, r, n: 8, mode: 'in' };
      if(fx) q.flipx = true; if(fy) q.flipy = true;
      setCorner(q, snap(w.x), snap(w.y));
      def.obstacles.push(q);
      sel = { kind: 'region', i: def.obstacles.length - 1 };
      drag = { mode: 'move', w0: w, snap0: JSON.stringify(q) };
      mutated();
    }
  });
  surf.addEventListener('pointermove', e => {
    if(!drag) return;
    const w = evWorld(e);
    if(drag.mode === 'pan'){
      const r = surf.getBoundingClientRect();
      // convert pixel delta to world delta via two unprojects
      const a = R.unproject(drag.sx - r.left, drag.sy - r.top), b = R.unproject(e.clientX - r.left, e.clientY - r.top);
      cam.x = drag.cx - (b.x - a.x); cam.y = drag.cy - (b.y - a.y);
      return;
    }
    if(drag.mode === 'block'){
      const o = def.obstacles[sel.i];
      const x1 = snap(w.x), y1 = snap(w.y);
      const nx0 = Math.min(drag.x0, x1), nx1 = Math.max(drag.x0, x1, nx0 + MIN_BLOCK);
      const ny0 = Math.min(drag.y0, y1), ny1 = Math.max(drag.y0, y1, ny0 + MIN_BLOCK);
      def.obstacles[sel.i] = Object.assign(o, mkBlock(nx0, ny0, nx1, ny1));
      mutated(); return;
    }
    if(drag.mode === 'discR'){
      const o = def.obstacles[sel.i];
      o.r = Math.max(MIN_DISC, snap(Math.hypot(w.x - o.cx, w.y - o.cy)) || o.r);
      mutated(); return;
    }
    if(drag.mode === 'move'){
      const dx = snap(w.x - drag.w0.x), dy = snap(w.y - drag.w0.y);
      const s0 = JSON.parse(drag.snap0);
      if(sel.kind === 'bay'){ def.bay.x = s0.x + dx; def.bay.y = s0.y + dy; }
      else if(sel.kind === 'start'){ def.start.x = s0.x + dx; def.start.y = s0.y + dy; }
      else {
        const o = def.obstacles[sel.i];
        if(o.t === 'cone'){ o.x = s0.x + dx; o.y = s0.y + dy; }
        else if(o.t === 'half'){ o.at = s0.at + (o.axis === 'x' ? dx : dy); }
        else if(o.t === 'disc'){
          if(drag.part === 'radius') o.r = Math.max(MIN_DISC, snap(Math.hypot(w.x - o.cx, w.y - o.cy)));
          else { o.cx = s0.cx + dx; o.cy = s0.cy + dy; }
        }
        else if(o.t === 'and'){ const r0 = rectOf(s0); def.obstacles[sel.i] = Object.assign(o, mkBlock(r0.x0 + dx, r0.y0 + dy, r0.x1 + dx, r0.y1 + dy)); }
        else if(o.t === 'quad'){
          const wx = (s0.flipx ? -s0.ccx : s0.ccx) + dx, wy = (s0.flipy ? -s0.ccy : s0.ccy) + dy;
          setCorner(o, wx, wy);
        }
      }
      mutated(); return;
    }
  });
  const endDrag = () => { drag = null; };
  surf.addEventListener('pointerup', endDrag);
  surf.addEventListener('pointercancel', endDrag);

  // corner helper: place fillet centre at world (wx,wy); quadrant edges tangent
  function setCorner(q, wx, wy){
    q.ccx = q.flipx ? -wx : wx;
    q.ccy = q.flipy ? -wy : wy;
    q.ex = q.ccx - q.r; q.ey = q.ccy - q.r;
  }

  const selNode = () => sel && sel.kind !== 'bay' && sel.kind !== 'start' ? def.obstacles[sel.i] : null;

  // ---------------------------------------------------------------- keyboard
  function key(e){
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')){
      if(e.key === 'Escape') e.target.blur();
      return;
    }
    if(e.key === 'Escape'){ if(sel){ sel = null; renderParams(); } else ctx.onExit(); return; }
    if((e.ctrlKey || e.metaKey) && k === 'z'){ undo(); e.preventDefault(); return; }
    if(e.key === 'Delete' || e.key === 'Backspace'){
      if(sel && sel.kind !== 'bay' && sel.kind !== 'start'){ pushUndo(); def.obstacles.splice(sel.i, 1); sel = null; mutated(); }
      e.preventDefault(); return;
    }
    if(k === 'q' || k === 'e'){
      const d = k === 'q' ? DEG15 : -DEG15;
      if(sel && sel.kind === 'bay'){ pushUndo(); def.bay.ang = norm(def.bay.ang + d); mutated(); }
      else if(sel && sel.kind === 'start'){ pushUndo(); def.start.th = norm(def.start.th + d); mutated(); }
      return;
    }
    const PAN = 90 * dolly;
    if(k === 'w' || e.key === 'ArrowUp'){ cam.y -= PAN * 0.3; e.preventDefault(); }
    else if(k === 's' || e.key === 'ArrowDown'){ cam.y += PAN * 0.3; e.preventDefault(); }
    else if(k === 'a' || e.key === 'ArrowLeft'){ cam.x -= PAN * 0.3; e.preventDefault(); }
    else if(k === 'd' || e.key === 'ArrowRight'){ cam.x += PAN * 0.3; e.preventDefault(); }
    else if(/^[1-6]$/.test(k)){ setTool(['select','cone','edge','block','disc','corner'][+k - 1]); }
  }

  // ---------------------------------------------------------------- panel
  const TOOLS = ['select', 'cone', 'edge', 'block', 'disc', 'corner'];
  function setTool(t){
    tool = t;
    for(const b of document.querySelectorAll('#edTools button')) b.classList.toggle('on', b.dataset.tool === t);
    $('edEdgeOpts').style.display = t === 'edge' ? '' : 'none';
    $('edDiscOpts').style.display = t === 'disc' ? '' : 'none';
    $('edCornerOpts').style.display = t === 'corner' ? '' : 'none';
  }
  for(const b of document.querySelectorAll('#edTools button')) b.onclick = () => setTool(b.dataset.tool);

  function renderParams(){
    const box = $('edParams'); box.replaceChildren();
    const add = html => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); return d; };
    if(!sel){ add('<span class="ed-dim">nothing selected — click a shape, the bay (B) or the start (S)</span>'); positionGizmos(); return; }
    if(sel.kind === 'bay'){
      const d = add(`bay · <span class="ed-dim">Q/E rotate</span><br>fit
        <select id="edFit"><option value="trailer">trailer</option><option value="car">car</option><option value="rig">whole rig</option></select>`);
      const s = d.querySelector('#edFit'); s.value = def.bay.fit;
      s.onchange = () => { pushUndo(); def.bay.fit = s.value; mutated(); };
      return;
    }
    if(sel.kind === 'start'){ add('start pose · <span class="ed-dim">drag to move · Q/E rotate</span>'); return; }
    const o = def.obstacles[sel.i];
    if(!o) { sel = null; return; }
    if(o.t === 'cone') add('cone · <span class="ed-dim">drag to move · Del to remove</span>');
    else if(o.t === 'half') add('infinite wall · <span class="ed-dim">drag to shift · Del to remove</span>');
    else if(o.t === 'and') add('block · <span class="ed-dim">drag to move · Del to remove</span>');
    else if(o.t === 'disc'){
      const d = add(`circle wall · r <input id="edR" type="number" min="${MIN_DISC}" max="3000" step="5" value="${o.r}">
        <label><input id="edInv" type="checkbox" ${o.mode === 'out' ? 'checked' : ''}> inverted (arena)</label>`);
      d.querySelector('#edR').onchange = ev => { pushUndo(); o.r = clamp(+ev.target.value || o.r, MIN_DISC, 3000); mutated(); };
      d.querySelector('#edInv').onchange = ev => { pushUndo(); o.mode = ev.target.checked ? 'out' : 'in'; mutated(); };
    }
    else if(o.t === 'quad'){
      const d = add(`corner wall · r <input id="edR" type="number" min="${MIN_CORNER}" max="3000" step="5" value="${o.r}">
        squareness <select id="edN"><option value="2">round</option><option value="4">squarish</option><option value="8">square</option></select>`);
      d.querySelector('#edR').onchange = ev => {
        pushUndo();
        const w = regionHandle(o, cam);
        o.r = clamp(+ev.target.value || o.r, MIN_CORNER, 3000);
        setCorner(o, w.x, w.y); mutated();
      };
      const ns = d.querySelector('#edN'); ns.value = String(o.n || 2);
      ns.onchange = () => { pushUndo(); o.n = +ns.value; if(o.n === 2) delete o.n; mutated(); };
    }
  }

  function syncTopUI(){
    $('edName').value = def.name;
    $('edGoal').value = def.goal || '';
    $('edCount').textContent = `${def.obstacles.length} object${def.obstacles.length === 1 ? '' : 's'}`;
    $('edLinkRow').style.display = published ? '' : 'none';
    if(published) $('edLink').textContent = published.url;
  }
  $('edName').oninput = e => { def.name = e.target.value.slice(0, 40); mutated(); $('edName').value = def.name; };
  $('edGoal').oninput = e => { def.goal = e.target.value.slice(0, 140); mutated(); $('edGoal').value = def.goal; };
  $('edTest').onclick = () => {
    if(!def.name.trim()){ setStatus('give the level a name first', true); $('edName').focus(); return; }
    ctx.onTest(JSON.parse(defJson()));
  };
  $('edPublish').onclick = async () => {
    setStatus('publishing…');
    const res = await ctx.onPublish(JSON.parse(defJson()));
    if(res.ok){
      published = { id: res.id, url: `${location.origin}${location.pathname}?level=${res.id}` };
      setStatus(`✓ published — ${res.timeMs != null ? 'your proof run is the first record' : ''}`);
      syncTopUI();
    } else setStatus(res.reason || (res.offline ? 'offline — try again' : 'publish failed'), true);
  };
  $('edCopy').onclick = async () => {
    try{ await navigator.clipboard.writeText(published.url); setStatus('link copied'); }
    catch(e){ setStatus(published.url); }
  };
  $('edPlay').onclick = () => { if(published) ctx.onPlayPublished(published.id); };
  $('edNew').onclick = () => { pushUndo(); def = BLANK(); sel = null; cam = { x: 0, y: 0 }; mutated(); };
  $('edRemix').onclick = () => {
    const src = ctx.getRemixSource();
    if(!src || !src.bay){ setStatus('current level has no bay to remix', true); return; }
    pushUndo();
    def = {
      name: (src.name.replace(/^\d+ · /, '') + ' remix').slice(0, 40), goal: src.goal || '',
      start: { x: src.start.x, y: src.start.y, th: src.start.th },
      bay: { x: src.bay.x, y: src.bay.y, ang: src.bay.ang, fit: src.bay.fit },
      obstacles: JSON.parse(JSON.stringify(src.obstacles)),
    };
    sel = null; cam = { x: (src.start.x + src.bay.x) / 2, y: (src.start.y + src.bay.y) / 2 };
    dolly = clamp(Math.hypot(src.start.x - src.bay.x, src.start.y - src.bay.y) / 420, 0.6, 4);
    mutated();
  };
  $('edExit').onclick = () => ctx.onExit();

  function setStatus(msg, bad){
    const el = $('edStatus');
    el.textContent = msg || '';
    el.classList.toggle('bad', !!bad);
  }
  function setProofState(ok){
    $('edPublish').disabled = !ok;
    $('edPublish').title = ok ? '' : 'finish a test drive of the current version first';
  }

  // ---------------------------------------------------------------- activate
  let everActivated = false;
  function activate(){
    sel = null; drag = null; dirty = true;
    if(!everActivated){ cam = { x: (def.start.x + def.bay.x) / 2, y: (def.start.y + def.bay.y) / 2 }; everActivated = true; }
    setTool(tool);
    renderParams(); syncTopUI();
  }

  // programmatic def replacement (e2e / import tooling)
  function setDef(d){ pushUndo(); def = JSON.parse(JSON.stringify(d)); sel = null; mutated(); }

  setTool('select'); renderParams(); syncTopUI();
  return { frame, key, activate, setStatus, setProofState, setDef, getDef: () => JSON.parse(defJson()) };
}
