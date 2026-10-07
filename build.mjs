// Build FieldVet into a single self-contained HTML page.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const GLOBAL = '/home/claude/.npm-global/lib/node_modules';
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require(GLOBAL + '/tsx/node_modules/esbuild'); }
const entry = process.argv[2] || 'src/main.tsx';
const out = process.argv[3] || 'dist/fieldvet.html';
const res = await esbuild.build({
  entryPoints: [entry], bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic',
  nodePaths: fs.existsSync(GLOBAL) ? [GLOBAL] : [], write: false, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'text' }, logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const fonts = fs.readFileSync('assets/fonts.css', 'utf8');
const css = fs.existsSync('src/styles.css') ? fs.readFileSync('src/styles.css', 'utf8') : '';
const page = `<title>FieldVet</title>
<meta name="description" content="Klickbar prototyp: fältoperativ plattform för mobil veterinärvård">
<style>${fonts}\n${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(out, page);
// Local preview wrapper mirroring the artifact skeleton
fs.writeFileSync(out.replace(/\.html$/, '.local.html'), `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
// Static website for free hosting (Cloudflare Pages, Netlify, GitHub Pages): dist/web/
const favicon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#2A7867"/><path d="M8.5 23.5c0-6 15-4.5 15-11.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="8.5" cy="23.5" r="2.6" fill="#fff"/><circle cx="23.5" cy="10" r="3.6" fill="#fff"/><circle cx="23.5" cy="10" r="1.4" fill="#2A7867"/></svg>');
const desc = 'Klickbar konceptprototyp för veterinärer som gör hembesök: samordnarens dashboard och veterinärens app i samma plan. Fiktiv data.';
fs.mkdirSync('dist/web', { recursive: true });
fs.writeFileSync('dist/web/index.html', `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${desc}">
<meta name="theme-color" content="#16222C">
<meta property="og:title" content="FieldVet – demo">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="icon" href="${favicon}">
<title>FieldVet – demo</title>
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui;background:#16222C}img{max-width:100%}[hidden]{display:none!important}</style>
<style>${fonts}\n${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`);
fs.writeFileSync('dist/web/robots.txt', 'User-agent: *\nDisallow: /\n');
// Cloudflare Pages / Netlify: keep the demo out of search engines and always serve the latest version.
fs.writeFileSync('dist/web/_headers', '/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n');
console.log('built', out, (page.length / 1024).toFixed(0) + ' KB', '+ dist/web/');
