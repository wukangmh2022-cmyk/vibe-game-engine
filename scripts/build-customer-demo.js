#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const runtimeDir = path.join(root, 'web', 'dist');
const gameDir = path.join(root, 'customer-demo');
const pageTemplate = path.join(root, 'pages', 'customer-demo.html');
const output = path.join(root, 'gh-pages');

for (const source of [runtimeDir, gameDir, pageTemplate]) {
  if (!fs.existsSync(source)) throw new Error(`Missing customer demo build input: ${source}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(runtimeDir, output, { recursive: true });
fs.cpSync(gameDir, path.join(output, 'game'), {
  recursive: true,
  filter: source => !source.endsWith(`${path.sep}modify.json`) && !source.endsWith(`${path.sep}scene${path.sep}login.json`)
});
fs.copyFileSync(pageTemplate, path.join(output, 'index.html'));
fs.writeFileSync(path.join(output, '.nojekyll'), '');

console.log(`[customer-demo] Built static Pages site at ${output}`);
