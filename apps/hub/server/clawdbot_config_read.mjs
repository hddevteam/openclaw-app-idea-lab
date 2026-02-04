import fs from 'node:fs/promises';

export async function readClawdbotAzureConfig(){
  const p = process.env.CLAWDBOT_CONFIG || `${process.env.HOME}/.clawdbot/clawdbot.json`;
  const raw = await fs.readFile(p, 'utf8');
  const j = JSON.parse(raw);
  const az = j?.models?.providers?.['azure-openai'];
  if(!az) throw new Error('azure-openai provider not found in clawdbot.json');
  return {
    baseUrl: az.baseUrl,
    apiKey: az.apiKey,
  };
}
