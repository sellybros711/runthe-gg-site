/* What the dispatcher's two scripts share: the agents, read from the two checkouts, and how a chat's
 * title says whose it is. Pure, so test/dispatch.test.mjs drives it with fixtures. */
import fs from 'node:fs';
import path from 'node:path';

export const keyOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function front(md, k){ const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(md || ''); return m ? m[1].trim() : null; }

// the agents: .claude/agents/<id>.md on the site, agents/<id>/ in the vault; named by their spec's title
export function agentsFrom(site, vault){
  const ids = new Set();
  try { for (const f of fs.readdirSync(path.join(site, '.claude/agents'))) if (/^[a-z0-9-]+\.md$/.test(f)) ids.add(f.slice(0, -3)); } catch (e) {}
  try { for (const d of fs.readdirSync(path.join(vault, 'agents'), { withFileTypes: true })) if (d.isDirectory()) ids.add(d.name); } catch (e) {}
  return [...ids].sort().map(id => { let spec = null; try { spec = fs.readFileSync(path.join(vault, 'agents', id, id + '-spec.md'), 'utf8'); } catch (e) {}
    const t = spec && front(spec, 'title'); return { id, name: t ? t.replace(/\s+spec$/i, '') : id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ' Agent' }; });
}

// whose chat is it: a title with "agent" in it that names an agent; the longest name wins (Run The Floor Art over Run The Floor)
export function ownerOf(title, agents){
  const t = keyOf(title); if (!/agent/i.test(title || '')) return null;
  let best = null;
  for (const a of agents) { const k = keyOf(a.name.replace(/\bagent\b/i, '')); if (k.length >= 2 && t.includes(k) && (!best || k.length > best.k.length)) best = { id: a.id, k }; }
  return best ? best.id : null;
}

// list_sessions' answer, however it was saved: the JSON object holding the sessions, found in the text
export function sessionsFrom(text){
  const i = text.search(/\{"(ccr|data|sessions)"/); if (i < 0) return [];
  let v; try { v = JSON.parse(text.slice(i)); } catch (e) { try { v = JSON.parse(text.slice(i, text.lastIndexOf('}') + 1)); } catch (e2) { return []; } }
  const list = (v.ccr && v.ccr.data) || v.data || v.sessions || [];
  return list.map(s => { const em = s.external_metadata || {}, br = Object.values(em.current_branches || {}).filter(Boolean);
    return { id: s.id, title: s.title || '', status: String(s.session_status || '').replace('SESSION_STATUS_', '').toLowerCase(),
      bucket: String(s.status_bucket || '').replace('SESSION_STATUS_BUCKET_', '').toLowerCase() || 'idle', summary: typeof em.task_summary === 'string' ? em.task_summary : '',
      branch: br[0] || null, created: s.created_at, updated: s.updated_at }; });
}
