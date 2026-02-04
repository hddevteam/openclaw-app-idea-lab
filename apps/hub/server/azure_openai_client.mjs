import { request } from 'undici';

export async function callAzureOpenAI({ baseUrl, apiKey, model, input, timeoutMs = 60000 }){
  if(!baseUrl || !apiKey) throw new Error('azure config missing');
  // Azure OpenAI compatible endpoint (per clawdbot/openclaw config): baseUrl already includes /openai/v1/
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/+$/,'') + '/responses';

  const bodyObj = {
    model,
    input,
  };

  const { statusCode, body } = await request(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let raw='';
  for await (const chunk of body) raw += chunk.toString();

  if(statusCode >= 400){
    throw new Error(`Azure OpenAI HTTP ${statusCode}: ${raw.slice(0,500)}`);
  }

  const j = JSON.parse(raw);
  return j;
}

export function extractTextFromResponse(resp){
  // responses API: output -> content blocks
  const out = resp?.output;
  if(!Array.isArray(out)) return '';
  let s='';
  for(const item of out){
    const content = item?.content;
    if(!Array.isArray(content)) continue;
    for(const c of content){
      if(c?.type==='output_text' && typeof c.text==='string') s += c.text;
    }
  }
  return s.trim();
}
