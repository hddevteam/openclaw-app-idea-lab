import fs from 'node:fs/promises';
import path from 'node:path';
import { mime } from './mime.mjs';

export function safeJoin(root, reqPath){
  const clean = decodeURIComponent(reqPath.split('?')[0]);
  const joined = path.normalize(path.join(root, clean));
  if(!joined.startsWith(root)) return null;
  return joined;
}

export async function serveFile(res, filePath, reqUrl, contentModifier){
  try {
    let fp = filePath;
    const stat = await fs.stat(fp);
    if(stat.isDirectory()) {
      if (reqUrl && !reqUrl.pathname.endsWith('/')) {
        res.writeHead(302, { 'Location': reqUrl.pathname + '/' + (reqUrl.search || '') });
        res.end();
        return true;
      }
      fp = path.join(fp, 'index.html');
    }
    const ext = path.extname(fp);
    let body = await fs.readFile(fp);

    if (contentModifier && (ext === '.html' || ext === '.htm')) {
      body = contentModifier(body.toString('utf8'), fp);
    }

    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    // Let caller decide fallthrough vs 404.
    return false;
  }
  return true;
}
