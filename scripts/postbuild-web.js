const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'web', 'dist');

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(root)) {
  console.error('web/dist not found, skip postbuild');
  process.exit(0);
}

const files = walk(root).filter(f => f.endsWith('.js'));

function resolveSpec(spec, basedir) {
  // Only rewrite relative imports
  if (!(spec.startsWith('./') || spec.startsWith('../'))) return spec;
  // Already has extension
  if (/\.(js|mjs|cjs|json)$/i.test(spec)) return spec;
  const asJs = path.join(basedir, spec + '.js');
  const asIndex = path.join(basedir, spec, 'index.js');
  if (fs.existsSync(asJs)) return spec + '.js';
  if (fs.existsSync(asIndex)) return spec + '/index.js';
  // Fallback: append .js
  return spec + '.js';
}

let rewritten = 0;
for (const file of files) {
  const basedir = path.dirname(file);
  let code = fs.readFileSync(file, 'utf8');
  const before = code;
  const rewrite = (m, p1, spec, p3) => p1 + resolveSpec(spec, basedir) + p3;
  code = code
    .replace(/(import\s+[^'";]+?from\s*['"])([^'"\n]+)(['"])/g, rewrite)
    .replace(/(export\s+[^'";]+?from\s*['"])([^'"\n]+)(['"])/g, rewrite)
    .replace(/(import\(\s*['"])([^'"\n]+)(['"]\s*\))/g, rewrite);
  if (code !== before) {
    fs.writeFileSync(file, code, 'utf8');
    rewritten++;
  }
}
console.log(`[postbuild-web] Rewrote imports in ${rewritten} files to include proper .js or /index.js extensions.`);

// Also copy a standalone runtime HTML to web/dist for convenience
try {
  const src = path.join(__dirname, '..', 'level-editor', 'public', 'run.html');
  const dstDir = path.join(__dirname, '..', 'web', 'dist');
  const dst = path.join(dstDir, 'run.html');
  if (fs.existsSync(src)) {
    fs.mkdirSync(dstDir, { recursive: true });
    fs.copyFileSync(src, dst);
    // Rewrite absolute bootstrap import to relative for file:// usage
    try {
      let html = fs.readFileSync(dst, 'utf8');
      const before = html;
      html = html.replace(
        /(import\s*\(\s*['"])\/web\/dist\/browser\/bootstrap\.js(['"]\s*\))/g,
        (m, p1, p2) => `${p1}./browser/bootstrap.js${p2}`
      );
      html = html.replace(
        /(['"])\/web\/dist\/browser\/bootstrap\.js(['"])/g,
        (m, p1, p2) => `${p1}./browser/bootstrap.js${p2}`
      );
      if (html !== before) {
        fs.writeFileSync(dst, html, 'utf8');
        console.log('[postbuild-web] Rewrote run.html import to ./browser/bootstrap.js');
      } else {
        console.log('[postbuild-web] Copied run.html (no rewrite needed)');
      }
    } catch (e) {
      console.warn('[postbuild-web] rewrite run.html failed:', e);
    }
  }
} catch (e) { console.warn('[postbuild-web] copy run.html failed:', e); }
