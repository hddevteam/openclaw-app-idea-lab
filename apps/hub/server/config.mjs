import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Hub root = apps/hub (this file lives in apps/hub/server)
export const HUB_ROOT = path.resolve(HERE, '..');

// Monorepo root
export const PROJECT_ROOT = path.resolve(HUB_ROOT, '..', '..');

// Engine root = packages/engine (override via DAILY_APP_LAB_ROOT)
export const LAB_ROOT = process.env.DAILY_APP_LAB_ROOT
  ? path.resolve(process.env.DAILY_APP_LAB_ROOT)
  : path.resolve(PROJECT_ROOT, 'packages', 'engine');

export const LAB_RUNTIME = path.join(LAB_ROOT, 'runtime');
export const LAB_OUTPUTS = path.join(LAB_ROOT, 'outputs');

export const PORT = Number(process.env.DAILY_APP_LAB_PORT || 41777);

export const USER = process.env.DAILY_APP_LAB_USER || '';
export const PASS = process.env.DAILY_APP_LAB_PASS || '';

