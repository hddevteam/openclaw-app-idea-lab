import fs from 'node:fs/promises';
import path from 'node:path';

function cleanDate(date){
  return String(date||'').replace(/[^0-9A-Za-z\-]/g,'');
}

export async function loadFeedback(feedbackDir, date){
  const d = cleanDate(date);
  if(!d) return null;
  try{
    const raw = await fs.readFile(path.join(feedbackDir, `${d}.json`), 'utf8');
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

export async function saveFeedback(feedbackDir, { date, rating, tags = [], notes = '' }){
  const d = cleanDate(date);
  if(!d) throw new Error('date required');
  const r = Number(rating);
  if(!(r>=1 && r<=5)) throw new Error('rating must be 1..5');

  await fs.mkdir(feedbackDir, { recursive: true });

  const file = path.join(feedbackDir, `${d}.json`);
  const data = {
    date: d,
    rating: r,
    tags: (tags && typeof tags === 'object' && !Array.isArray(tags)) ? tags : {},
    notes: String(notes||'').slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, file, data };
}
