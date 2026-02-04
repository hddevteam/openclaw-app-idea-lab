import { listOutputsAsManifest } from './manifest_dynamic.mjs';
import { LAB_OUTPUTS } from './config.mjs';

export async function handleManifest(res){
  const json = await listOutputsAsManifest({ labOutputs: LAB_OUTPUTS });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(json));
}
