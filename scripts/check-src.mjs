import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ...readdirSync(join(root, 'src')).filter(f => f.endsWith('.js')).map(f => join('src', f)),
  ...readdirSync(join(root, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => join('scripts', f))
];
let fail = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' });
    console.log('ok   ' + f);
  } catch (e) {
    fail = 1;
    console.error('FAIL ' + f + '\n' + e.stderr);
  }
}
process.exit(fail);
