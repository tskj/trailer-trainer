// Leaderboard API client. Every call degrades gracefully: if the server is
// unreachable (static hosting, offline, dev without backend) callers get null
// and the UI simply hides board content.
const J = r => r.ok ? r.json() : null;

export async function fetchBoards(levelId, name){
  try{
    const q = new URLSearchParams({ level: levelId });
    if(name) q.set('name', name);
    return await J(await fetch(`/api/boards?${q}`, { signal: AbortSignal.timeout(6000) }));
  }catch(e){ return null; }
}

// summary for the level-select overlay: per-level #1s + your bests
export async function fetchSummary(name){
  try{
    const q = name ? `?name=${encodeURIComponent(name)}` : '';
    return await J(await fetch(`/api/summary${q}`, { signal: AbortSignal.timeout(6000) }));
  }catch(e){ return null; }
}

// one stored run's full payload (seed + packed ticks) for watch-a-replay
export async function fetchReplay(id){
  try{
    return await J(await fetch(`/api/replay?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) }));
  }catch(e){ return null; }
}

export async function submitRun(payload){
  try{
    const r = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
    });
    if(r.status === 422) return { ok:false, rejected:true, ...(await r.json().catch(()=>({}))) };
    return await J(r) ?? { ok:false, offline:true };
  }catch(e){ return { ok:false, offline:true }; }
}
