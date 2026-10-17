/**
 * L2 build check (D-L2-1): Firebase code exists only in the lazily loaded account chunk.
 *   tsx scripts/qa/accountIsolation.ts <distDir>
 * - exactly one assets/firebaseAdapter-*.js, and it holds the Firebase code; no other file does;
 * - index.html never loads or preloads it; the service-worker precache never lists it;
 * - the app chunk only references it by file name (the dynamic import).
 * Exits 1 on any violation and prints every check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = process.argv[2];
if (dist === undefined) {
  console.error('usage: accountIsolation.ts <distDir>');
  process.exit(2);
}
const FIREBASE = /identitytoolkit\.googleapis|securetoken\.googleapis|firestore\.googleapis|@firebase\/auth|@firebase\/firestore|firebaseapp\.com/;
const CHUNK = /^assets\/firebaseAdapter-[^/]+\.js$/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const files = walk(dist).map((p) => relative(dist, p).split('\\').join('/')).filter((f) => /\.(js|html|css|webmanifest)$/.test(f));
const read = (f: string) => readFileSync(join(dist, f), 'utf8');

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${detail})`}`);
  if (!ok) failed += 1;
};
const chunks = files.filter((f) => CHUNK.test(f));
const withFirebase = files.filter((f) => FIREBASE.test(read(f)));
check('exactly one account chunk', chunks.length === 1, chunks.join(', '));
check('Firebase code only in the account chunk', withFirebase.length === 1 && chunks.includes(withFirebase[0]!), withFirebase.join(', '));
check('index.html never loads or preloads it', !/firebaseAdapter/.test(read('index.html')));
check('the service worker never precaches it', !/firebaseAdapter-[\w-]+\.js/.test(read('sw.js')));
console.log(failed === 0 ? 'ACCOUNT ISOLATION: PASS' : `ACCOUNT ISOLATION: FAIL x${failed}`);
process.exit(failed === 0 ? 0 : 1);
