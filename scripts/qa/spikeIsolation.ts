/**
 * L0 Login Spike isolation check on a built `dist` (branch login-spike only).
 *
 *   tsx scripts/qa/spikeIsolation.ts <distDir> spike       — this branch's build
 *   tsx scripts/qa/spikeIsolation.ts <distDir> production  — a production build (e.g. c6fdf23)
 *
 * spike:      Firebase code exists ONLY in assets/loginSpike-*.js; index.html and the service-worker
 *             precache never reference the spike page or its chunk.
 * production: no spike page, no spike link, no Firebase code anywhere.
 * Exits 1 on any violation and prints every check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [distArg, mode] = process.argv.slice(2);
if (distArg === undefined || (mode !== 'spike' && mode !== 'production')) {
  console.error('usage: spikeIsolation.ts <distDir> spike|production');
  process.exit(2);
}
const dist = distArg;
const FIREBASE = /identitytoolkit\.googleapis|securetoken\.googleapis|firebaseapp\.com|@firebase\/auth/;
const SPIKE_CHUNK = /^assets\/loginSpike-[^/]+\.js$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist)
  .map((p) => relative(dist, p).split('\\').join('/'))
  .filter((f) => /\.(js|html|css|webmanifest)$/.test(f));
const read = (f: string) => readFileSync(join(dist, f), 'utf8');

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${detail})`}`);
  if (!ok) failed += 1;
}

const withFirebase = files.filter((f) => FIREBASE.test(read(f)));
const sw = read('sw.js');
const index = read('index.html');

if (mode === 'spike') {
  check('dist/login-spike.html exists', existsSync(join(dist, 'login-spike.html')));
  const spikeChunks = files.filter((f) => SPIKE_CHUNK.test(f));
  check('exactly one spike chunk', spikeChunks.length === 1, spikeChunks.join(', '));
  check('Firebase code only in the spike chunk', withFirebase.length > 0 && withFirebase.every((f) => SPIKE_CHUNK.test(f)), withFirebase.join(', '));
  check('login-spike.html loads the spike chunk', spikeChunks.every((c) => read('login-spike.html').includes(c)));
  check('index.html never references the spike', !/loginSpike|login-spike/.test(index));
  const mainChunks = files.filter((f) => f.endsWith('.js') && !SPIKE_CHUNK.test(f) && f !== 'sw.js' && !f.startsWith('workbox-'));
  check('no app chunk imports the spike chunk', mainChunks.every((f) => !/loginSpike-/.test(read(f))));
  check('service worker does not precache the spike page or chunk', !/loginSpike-|login-spike\.html/.test(sw));
  check('service worker never answers /login-spike with index.html', /login-spike/.test(sw));
} else {
  check('no login-spike.html', !existsSync(join(dist, 'login-spike.html')));
  check('no Firebase code anywhere', withFirebase.length === 0, withFirebase.join(', '));
  check('no file mentions the spike', files.every((f) => !/loginSpike|login-spike/.test(read(f))));
}
console.log(failed === 0 ? `SPIKE ISOLATION (${mode}): PASS` : `SPIKE ISOLATION (${mode}): FAIL ×${failed}`);
process.exit(failed === 0 ? 0 : 1);
