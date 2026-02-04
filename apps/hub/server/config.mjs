import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Hub root = apps/hub (this file lives in apps/hub/server)
export const HUB_ROOT = path.resolve(HERE, '..');

// Engine root = packages/engine (override via DAILY_WEB_LAB_ROOT)
export const LAB_ROOT = process.env.DAILY_WEB_LAB_ROOT
  ? path.resolve(process.env.DAILY_WEB_LAB_ROOT)
  : path.resolve(HUB_ROOT, '..', '..', 'packages', 'engine');

export const LAB_RUNTIME = path.join(LAB_ROOT, 'runtime');
export const LAB_OUTPUTS = path.join(LAB_ROOT, 'outputs');

export const PORT = Number(process.env.DAILY_WEB_LAB_PORT || 41777);

export const USER = process.env.DAILY_WEB_LAB_USER || 'ming';
export const PASS = process.env.DAILY_WEB_LAB_PASS || '';

