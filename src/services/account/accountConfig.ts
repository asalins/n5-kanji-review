/**
 * Account feature switch (D-L2-8 / C3). The account section exists only when BOTH are present:
 *  - the Firebase web config (VITE_FIREBASE_*: Cloudflare Pages Preview env only; production has none), and
 *  - the privacy contact e-mail shown on the Privacy page.
 * Without either, sign-in is not offered at all and the app behaves exactly as before.
 * The web config is client configuration, not a secret, and never a substitute for Security Rules.
 */
export const PRIVACY_CONTACT_EMAIL = 'n5kanjireview.support@gmail.com';

export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

type Env = Partial<Record<'VITE_FIREBASE_API_KEY' | 'VITE_FIREBASE_AUTH_DOMAIN' | 'VITE_FIREBASE_PROJECT_ID' | 'VITE_FIREBASE_APP_ID', string>>;

export function readFirebaseConfig(env: Env): FirebaseWebConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
  return Object.values(config).every((v) => v.trim() !== '') ? config : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContactEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isAccountAvailable(config: FirebaseWebConfig | null, contactEmail: string): config is FirebaseWebConfig {
  return config !== null && isValidContactEmail(contactEmail);
}
