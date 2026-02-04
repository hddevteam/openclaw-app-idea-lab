export function unauthorized(res){
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Daily Web Lab"' });
  res.end('auth required');
}

export function checkAuth(req, { user, pass }){
  // If accessing via localhost/loopback, skip auth for convenience.
  const host = String(req.headers.host || '');
  if(host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;

  if(!pass) return true;
  const h = req.headers['authorization'];
  if(!h || !h.startsWith('Basic ')) return false;
  const raw = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const [u,p] = raw.split(':');
  return u === user && p === pass;
}
