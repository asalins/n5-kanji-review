/**
 * The ONLY module (with firestoreCloud.ts, which only it imports) that imports Firebase. It is loaded with a dynamic import (its own chunk), so a user who never
 * signs in never downloads the SDK (D-L2-1). Google Popup only (L0: Redirect failed in every context).
 */
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  deleteUser,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { CloudStore } from '../sync/cloudTypes';
import type { FirebaseWebConfig } from './accountConfig';
import type { AccountUser, AuthAdapter } from './accountTypes';
import { createFirestoreCloud } from './firestoreCloud';

const toUser = (user: User): AccountUser => ({ uid: user.uid, email: user.email });

export function createFirebaseAdapter(config: FirebaseWebConfig): AuthAdapter {
  const app = initializeApp({ ...config });
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  return adapterForAuth(auth, () => getFirestore(app));
}

/** The adapter over an existing Auth instance (also used by the Auth Emulator integration tests). */
export function adapterForAuth(auth: Auth, firestore?: () => Firestore): AuthAdapter {
  let cloud: CloudStore | null = null;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const current = (): User => {
    if (auth.currentUser === null) throw Object.assign(new Error('No signed-in user'), { code: 'auth/no-current-user' });
    return auth.currentUser;
  };

  return {
    onUserChange: (listener) => onAuthStateChanged(auth, (user) => listener(user === null ? null : toUser(user))),
    signInWithPopup: async () => toUser((await signInWithPopup(auth, provider)).user),
    reauthenticateWithPopup: async () => {
      await reauthenticateWithPopup(current(), provider);
    },
    reload: () => current().reload(),
    signOut: () => signOut(auth),
    deleteUser: () => deleteUser(current()),
    cloud() {
      if (firestore === undefined) return null;
      cloud ??= createFirestoreCloud(firestore(), auth);
      return cloud;
    },
  };
}
