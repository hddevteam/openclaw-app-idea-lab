// Hash-embedding similarity (same as idea-lab local implementation)

function tokenize(s){
  return String(s||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ').split(/\s+/).filter(Boolean);
}
function hash32(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
export function embed(text, dims=256){
  const v = new Float32Array(dims);
  for(const t of tokenize(text)){
    const h=hash32(t); const idx=h%dims; const sign=(h&1)?1:-1;
    v[idx]+=sign;
  }
  let ss=0; for(let i=0;i<dims;i++) ss+=v[i]*v[i];
  const n=Math.sqrt(ss)||1; for(let i=0;i<dims;i++) v[i]/=n;
  return v;
}
export function cosine(a,b){
  const n=Math.min(a.length,b.length);
  let s=0; for(let i=0;i<n;i++) s+=a[i]*b[i];
  return s;
}
