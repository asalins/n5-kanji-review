/// <reference types="vite/client" />

/** Firebase web config for the L0 Login Spike only (Cloudflare Pages Preview env; never committed). */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
