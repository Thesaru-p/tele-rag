import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnv() {
  try {
    for (const line of readFileSync(resolve(import.meta.dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* CI and deployments supply environment variables directly. */ }
}
