import './style.css';

// Network skill: latency + packet-loss playground (simulated), with self-healing.

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="hud" id="hud">
    <div class="title">Network Playground</div>
    <div class="row">Tap: new burst · Drag: move server · Pinch: zoom · Two-finger tap: heal</div>
    <div class="actions">
      <button id="burst">Burst</button>
      <button id="heal">Heal</button>
      <button id="reset">Reset</button>
    </div>
    <div class="row" id="status">OK</div>
  </div>
  <div class="toast" id="toast">Healed</div>
  <canvas id="c"></canvas>
`;

const canvas = document.querySelector('#c');
const ctx = canvas.getContext('2d', { alpha:false });
const hud = document.querySelector('#hud');
const toast = document.querySelector('#toast');
const statusEl = document.querySelector('#status');

const S = {
  dpr: 1, w: innerWidth, h: innerHeight,
  zoom: 1,
  server: { x: innerWidth*0.72, y: innerHeight*0.42 },
  packets: [],
  lastGood: performance.now(),
  seed: Math.random()*1e9,
};

function setStatus(t){ statusEl.textContent = t; }
function showHud(ms=2200){ hud.classList.remove('hidden'); clearTimeout(showHud._t); showHud._t=setTimeout(()=>hud.classList.add('hidden'), ms); }
function toastMsg(t){ toast.textContent=t; toast.classList.add('show'); clearTimeout(toastMsg._t); toastMsg._t=setTimeout(()=>toast.classList.remove('show'), 900); }

function resize(){
  S.w=innerWidth; S.h=innerHeight;
  S.dpr=Math.max(1, Math.min(2, devicePixelRatio||1));
  canvas.width=Math.floor(S.w*S.dpr);
  canvas.height=Math.floor(S.h*S.dpr);
  canvas.style.width=S.w+'px';
  canvas.style.height=S.h+'px';
  ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
}
addEventListener('resize', ()=>{resize(); showHud(1200);});
addEventListener('orientationchange', ()=>setTimeout(()=>{resize(); showHud(1200);}, 200));
resize();

function rnd(){ S.seed=(S.seed*1664525+1013904223)%4294967296; return S.seed/4294967296; }

function burst(){
  const n = 28;
  for(let i=0;i<n;i++) S.packets.push(spawnPacket());
  showHud(1200);
}

function spawnPacket(){
  const src = { x: S.w*0.28 + (rnd()-0.5)*60, y: S.h*0.60 + (rnd()-0.5)*60 };
  const dst = { x: S.server.x, y: S.server.y };
  const latency = 120 + rnd()*900; // ms
  const loss = rnd() < 0.08; // 8% loss
  const jitter = (rnd()-0.5)*140;
  return { src, dst, t0: performance.now(), latency, jitter, loss, phase:0, done:false };
}

function heal(reason='auto'){
  S.packets = S.packets.filter(p=>p && p.src && p.dst);
  if(S.packets.length>1200) S.packets = S.packets.slice(-400);
  S.seed = Math.random()*1e9;
  S.lastGood = performance.now();
  toastMsg(reason==='manual'?'Healed':'Auto-healed');
  setStatus('OK');
  showHud(2000);
}

window.addEventListener('error', ()=>{ setStatus('Recovered from error'); heal('error'); });
window.addEventListener('unhandledrejection', ()=>{ setStatus('Recovered from rejection'); heal('rejection'); });
setInterval(()=>{
  if(performance.now()-S.lastGood>2500){ setStatus('Watchdog'); heal('watchdog'); }
}, 800);

let pointers=new Map();
let pinchStart=null;

canvas.addEventListener('pointerdown', (e)=>{
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pointers.size===1) burst();
  showHud(2400);
});
canvas.addEventListener('pointermove', (e)=>{
  const p=pointers.get(e.pointerId); if(!p) return;
  const dx=e.clientX-p.x, dy=e.clientY-p.y;
  p.x=e.clientX; p.y=e.clientY;
  if(pointers.size===1){
    S.server.x = clamp(S.server.x+dx, 40, S.w-40);
    S.server.y = clamp(S.server.y+dy, 40, S.h-40);
  }
});
canvas.addEventListener('pointerup', (e)=>{ pointers.delete(e.pointerId); pinchStart=null; });

canvas.addEventListener('touchmove', (e)=>{
  if(e.touches.length===2){
    e.preventDefault();
    const a=e.touches[0], b=e.touches[1];
    const dist=Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
    if(pinchStart==null) pinchStart=dist;
    const ratio=dist/pinchStart;
    S.zoom = clamp(ratio, 0.65, 1.8);
  }
}, {passive:false});

canvas.addEventListener('touchstart', (e)=>{
  if(e.touches.length>=2){ e.preventDefault(); heal('manual'); }
}, {passive:false});

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

document.querySelector('#burst').onclick = burst;
document.querySelector('#heal').onclick = ()=>heal('manual');
document.querySelector('#reset').onclick = ()=>{ S.packets=[]; S.zoom=1; heal('manual'); };

function draw(){
  const now=performance.now();
  ctx.fillStyle='#07080c';
  ctx.fillRect(0,0,S.w,S.h);

  ctx.save();
  ctx.globalAlpha=0.28;
  ctx.strokeStyle='rgba(255,255,255,0.10)';
  const step=44*S.zoom;
  for(let x=0;x<S.w;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,S.h); ctx.stroke(); }
  for(let y=0;y<S.h;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S.w,y); ctx.stroke(); }
  ctx.restore();

  const client={ x:S.w*0.28, y:S.h*0.60 };
  drawNode(client.x, client.y, 'Client');
  drawNode(S.server.x, S.server.y, 'Server');

  for(const pkt of S.packets){
    if(pkt.done) continue;
    const age = now - pkt.t0;
    const t = clamp(age / Math.max(60, (pkt.latency + pkt.jitter)), 0, 1);
    pkt.phase = t;
    if(pkt.loss){
      if(age>260) pkt.done=true;
      continue;
    }
    const x = lerp(pkt.src.x, pkt.dst.x, ease(t));
    const y = lerp(pkt.src.y, pkt.dst.y, ease(t));
    const hue = 190 + 70*Math.sin((pkt.latency*0.01) + (pkt.jitter*0.02));
    ctx.fillStyle = 'hsla(' + hue + ',70%,60%,0.85)';
    ctx.beginPath();
    ctx.arc(x,y, 3.2, 0, Math.PI*2);
    ctx.fill();

    if(t>=1) pkt.done=true;
  }
  if(S.packets.length>1200) S.packets = S.packets.slice(-600);

  const alive = S.packets.filter(p=>!p.done && !p.loss).length;
  const lost = S.packets.filter(p=>p.loss && !p.done).length;
  setStatus('Packets: ' + alive + ' alive · ' + lost + ' lost · zoom ' + S.zoom.toFixed(2));

  S.lastGood = now;
  requestAnimationFrame(draw);
}

function lerp(a,b,t){ return a+(b-a)*t; }
function ease(t){ return 1-Math.pow(1-t,3); }
function drawNode(x,y,label){
  ctx.fillStyle='rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.arc(x,y, 18, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.20)';
  ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.font='12px system-ui';
  ctx.fillText(label, x-18, y-26);
}

showHud(2400);
burst();
draw();
