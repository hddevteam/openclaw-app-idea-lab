import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { isTooSimilar } from './rag_dedupe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_WEB_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const QUEUE = path.join(DATA, 'idea_queue.json');
const RAG_INDEX = path.join(DATA, 'rag_projects_index.json');

const THRESH = Number(process.env.DAILY_WEB_LAB_RAG_SIM_THRESHOLD || 0.72);

function pickCandidate(items) {
  // Prefer new/ready ideas; tolerate renamed schemas.
  const eligible = items.filter(it => {
    const st = (it.status || it.state || 'new').toLowerCase();
    return !['implemented','blocked','done','archived'].includes(st);
  });

  // Prioritize "implement-now" status
  const priority = eligible.find(it => (it.status || '').toLowerCase() === 'implement-now');
  if (priority) {
    console.log('backlog_pick_pm: found priority item (implement-now)');
    return priority;
  }

  // lowest failures first
  eligible.sort((a,b)=>(a.failures||0)-(b.failures||0));
  return eligible[0] || null;
}

async function main() {
  const raw = await fs.readFile(BACKLOG, 'utf8');
  const j = JSON.parse(raw);
  const items = j.items || j.ideas || j.backlog || [];
  const cand = pickCandidate(items);
  if (!cand) {
    console.log('backlog_pick_pm: none');
    return;
  }

  const query = [cand.title, cand.desc, cand.description, cand.scenario].filter(Boolean).join(' ');
  const sim = await isTooSimilar({ query, indexPath: RAG_INDEX, threshold: THRESH });
  if (sim.tooSimilar) {
    cand.failures = (cand.failures || 0) + 1;
    cand.lastFailureAt = Date.now();
    cand.lastFailureReason = `rag_dedupe(${sim.method}) score=${sim.best?.score?.toFixed?.(3)}`;
    if ((cand.failures || 0) >= 3) {
      cand.status = 'blocked';
    }
    await fs.writeFile(BACKLOG, JSON.stringify(j, null, 2));
    console.log('backlog_pick_pm: skipped (too similar)');
    return;
  }

  // Mark picked
  cand.pickedAt = Date.now();
  cand.status = cand.status || 'picked';
  await fs.writeFile(BACKLOG, JSON.stringify(j, null, 2));

  await fs.writeFile(QUEUE, JSON.stringify({ idea: cand }, null, 2));
  console.log('backlog_pick_pm: picked', cand.title || cand.name || '');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
