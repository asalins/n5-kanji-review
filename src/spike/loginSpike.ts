/**
 * L0 Login Spike (branch `login-spike` only; never merged to production).
 *
 * Proves Google sign-in with Firebase Auth on PC/Android, Chrome tab/installed PWA, popup and redirect.
 * It only signs in and out: no Firestore, no sync, and it never opens or changes the app's IndexedDB
 * (Firebase Auth keeps its own session in its own `firebaseLocalStorageDb` database).
 * Config comes from VITE_FIREBASE_* (Cloudflare Pages Preview env); nothing is committed.
 */
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const logEl = byId<HTMLDivElement>('log');
const statusEl = byId<HTMLDListElement>('status');
const lines: string[] = [];

function log(event: string, detail = ''): void {
  const line = `${new Date().toISOString()}  ${event}${detail === '' ? '' : `  ${detail}`}`;
  lines.push(line);
  logEl.textContent = lines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

function errorText(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const code = 'code' in err ? String((err as { code: unknown }).code) : '';
    const message = 'message' in err ? String((err as { message: unknown }).message) : '';
    return `${code} ${message}`.trim();
  }
  return String(err);
}

const standalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

let currentUser: User | null = null;

function renderStatus(): void {
  const rows: [string, string][] = [
    ['บริบท', standalone() ? 'PWA (standalone)' : 'Browser tab'],
    ['ออนไลน์', navigator.onLine ? 'online' : 'OFFLINE'],
    ['ผู้ใช้', currentUser === null ? '— ไม่ได้ล็อกอิน —' : `${currentUser.email ?? '(no email)'} · uid ${currentUser.uid.slice(0, 6)}…`],
    ['Origin', location.origin],
    ['User agent', navigator.userAgent],
  ];
  statusEl.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }),
  );
}

function readConfig(): Record<string, string> | null {
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(config).filter(([, v]) => typeof v !== 'string' || v === '');
  if (missing.length > 0) {
    log('CONFIG MISSING', missing.map(([k]) => k).join(', '));
    return null;
  }
  return config as Record<string, string>;
}

function wire(auth: Auth | null): void {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const need = (fn: (a: Auth) => Promise<void>) => () => {
    if (auth === null) {
      log('SKIPPED', 'no Firebase config');
      return;
    }
    void fn(auth);
  };

  byId('popup').addEventListener('click', need(async (a) => {
    log('A popup: start');
    try {
      const r = await signInWithPopup(a, provider);
      log('A popup: OK', r.user.email ?? r.user.uid);
    } catch (err) {
      log('A popup: ERROR', errorText(err));
    }
  }));
  byId('redirect').addEventListener('click', need(async (a) => {
    log('B redirect: start (page will leave)');
    try {
      sessionStorage.setItem('l0-redirect-started', new Date().toISOString());
      await signInWithRedirect(a, provider);
    } catch (err) {
      log('B redirect: ERROR', errorText(err));
    }
  }));
  byId('signout').addEventListener('click', need(async (a) => {
    try {
      await signOut(a);
      log('sign out: OK');
    } catch (err) {
      log('sign out: ERROR', errorText(err));
    }
  }));
  byId('token').addEventListener('click', need(async (a) => {
    if (a.currentUser === null) return log('token: no user');
    try {
      const t = await a.currentUser.getIdTokenResult(false);
      log('token (cached)', `issued ${t.issuedAtTime} · expires ${t.expirationTime} · auth ${t.authTime} · provider ${t.signInProvider ?? '?'}`);
    } catch (err) {
      log('token: ERROR', errorText(err));
    }
  }));
  byId('refresh').addEventListener('click', need(async (a) => {
    if (a.currentUser === null) return log('refresh: no user');
    try {
      await a.currentUser.getIdToken(true);
      const t = await a.currentUser.getIdTokenResult(false);
      log('refresh: OK', `issued ${t.issuedAtTime} · expires ${t.expirationTime}`);
    } catch (err) {
      log('refresh: ERROR', errorText(err));
    }
  }));
  byId('reload').addEventListener('click', need(async (a) => {
    if (a.currentUser === null) return log('reload: no user');
    try {
      await a.currentUser.reload();
      log('reload: OK (account exists)');
    } catch (err) {
      log('reload: ERROR', errorText(err));
    }
  }));
  byId('copy').addEventListener('click', () => {
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => log('log copied'),
      (err: unknown) => log('copy: ERROR', errorText(err)),
    );
  });
}

function start(): void {
  renderStatus();
  window.addEventListener('online', () => { log('event: online'); renderStatus(); });
  window.addEventListener('offline', () => { log('event: offline'); renderStatus(); });
  log('page loaded', standalone() ? 'PWA' : 'tab');

  const config = readConfig();
  if (config === null) {
    wire(null);
    return;
  }
  const app = initializeApp(config);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  wire(auth);

  const redirectStarted = sessionStorage.getItem('l0-redirect-started');
  getRedirectResult(auth).then(
    (r) => {
      if (r !== null) log('B redirect: OK', r.user.email ?? r.user.uid);
      else if (redirectStarted !== null) log('B redirect: returned with NO result', `started ${redirectStarted}`);
      sessionStorage.removeItem('l0-redirect-started');
    },
    (err: unknown) => {
      log('B redirect: ERROR', errorText(err));
      sessionStorage.removeItem('l0-redirect-started');
    },
  );
  onAuthStateChanged(auth, (u) => {
    currentUser = u;
    log('auth state', u === null ? 'signed out' : `signed in ${u.email ?? u.uid}`);
    renderStatus();
  });
  onIdTokenChanged(auth, (u) => {
    if (u === null) return;
    void u.getIdTokenResult(false).then(
      (t) => log('id token changed', `issued ${t.issuedAtTime}`),
      (err: unknown) => log('id token changed: ERROR', errorText(err)),
    );
  });
}

start();
