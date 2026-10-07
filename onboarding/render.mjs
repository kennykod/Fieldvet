import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const fonts = fs.readFileSync('/home/claude/fieldvet/assets/fonts.css', 'utf8');
fs.writeFileSync('onboarding.built.html', fs.readFileSync('onboarding.html', 'utf8').replace('/*FONTS*/', fonts));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/onboarding.built.html', { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: 'FieldVet_Onboarding.pdf', format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#8A989F;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>FieldVet · Kom igång · konceptprototyp, fiktiv data</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '15mm', bottom: '17mm', left: '16mm', right: '16mm' } });
await b.close(); console.log('ok');
