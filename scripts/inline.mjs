import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const out = join(dist, 'ct-visu.html');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script([^>]*?)\s+src="(\.\/assets\/[^"]+)"([^>]*)>\s*<\/script>/g, (m, pre, src, post) => {
  const code = readFileSync(join(dist, src.slice(2)), 'utf8');
  return `<script${pre}${post}>\n${code.replace(/<\/script>/g, '<\\/script>')}\n</script>`;
});

html = html.replace(/<link([^>]*?)\s+href="(\.\/assets\/[^"]+)"([^>]*?)\/?>/g, (m, pre, href, post) => {
  const css = readFileSync(join(dist, href.slice(2)), 'utf8');
  return `<style${pre}${post}>\n${css}\n</style>`;
});

if (/\.\/assets\//.test(html)) {
  console.error('external asset references remain in single-file output');
  process.exit(1);
}

writeFileSync(out, html);
console.log(`single-file build: ${out} (${(statSync(out).size / 1024).toFixed(0)} kB)`);
