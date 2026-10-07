// Shared setup for the Playwright e2e scripts. Works both in a normal project (npm install)
// and in the original build environment (global packages + preinstalled Chromium).
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
const GLOBAL = '/home/claude/.npm-global/lib/node_modules/';
const local = fs.existsSync(new URL('../node_modules/playwright', import.meta.url));
const require = createRequire(local || !fs.existsSync(GLOBAL) ? import.meta.url : GLOBAL);
export const { chromium } = require('playwright');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const launch = () => chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
/** The page with the visitor introduction turned off (as in a presenter link). */
export const APP_WITH_INTRO = pathToFileURL(fileURLToPath(new URL('../dist/fieldvet.local.html', import.meta.url))).href;
export const APP = APP_WITH_INTRO + '?intro=0';
/** Print the result and exit non-zero on failure, so `npm test` stops. */
export const finish = (name, errs) => { console.log(errs.length ? `FAIL ${name}\n${errs.join('\n')}` : `OK ${name}`); process.exit(errs.length ? 1 : 0); };
