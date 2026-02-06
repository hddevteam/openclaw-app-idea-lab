import { spawn } from 'node:child_process';

export function runPlannerResearch({ labRoot, timeoutMs = 300000 }){
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['core/modules/planner_research.mjs'], {
      cwd: labRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let out='';
    let err='';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());

    const t = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`planner_research timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', e => { clearTimeout(t); reject(e); });

    child.on('close', code => {
      clearTimeout(t);
      if(code === 0) return resolve({ ok:true, out, err });
      reject(new Error(`planner_research failed code=${code}\n${err||out}`));
    });
  });
}
