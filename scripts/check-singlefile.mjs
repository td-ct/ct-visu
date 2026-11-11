import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'ct-visu.html'), 'utf8');
const problems = [];

const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
const inlineModules = scripts.filter(s => s.includes('type="module"') && !/\ssrc=/.test(s));
if (inlineModules.length !== 1 || scripts.length !== 1) {
  problems.push(`erwartet genau 1 inline-Modul-Script, gefunden: ${scripts.length} (${inlineModules.length} inline)`);
}

const external = [...html.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map(m => m[1]);
if (external.length) problems.push('externe Referenzen: ' + external.join(', '));

if (/<link[^>]*rel="modulepreload"/i.test(html)) {
  problems.push('modulepreload-Link vorhanden (fetch-Polyfill wuerde auf file:// fehlschlagen)');
}
if (/\bfetch\(\s*['".]/.test(html.replace(/fetch\(s\.href/g, ''))) {
  problems.push('fetch() auf lokale Ressource gefunden');
}

for (const marker of ['btnPlay', 'id="monitor"', 'rDlpTotal', 'stepLabel', 'tblPos', 'Abspielen']) {
  if (!html.includes(marker)) problems.push('Marker fehlt im Bundle: ' + marker);
}

if (problems.length) {
  console.error('single-file check FAILED:\n - ' + problems.join('\n - '));
  process.exitCode = 1;
} else {
  console.log(`single-file check OK: 1 inline module (${(html.length / 1024).toFixed(0)} kB), keine externen Referenzen, keine file://-kritischen Aufrufe`);
}
