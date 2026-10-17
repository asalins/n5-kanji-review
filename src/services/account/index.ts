import { PRIVACY_CONTACT_EMAIL, isAccountAvailable, readFirebaseConfig } from './accountConfig';
import { createAccountHint } from './accountHint';
import { browserNetwork, createAccountService, type AccountService } from './accountService';

export type { AccountService } from './accountService';
export type { AccountStatus, AccountUser, DeleteAccountResult, LocalDataResult, SignInResult, SignOutResult } from './accountTypes';
export { PRIVACY_CONTACT_EMAIL } from './accountConfig';

/** Production wiring. The Firebase chunk is imported lazily, only when it is needed. */
export function createDefaultAccountService(resetLocalProgress: () => Promise<void>, logError?: (error: unknown) => void): AccountService {
  const config = readFirebaseConfig(import.meta.env);
  const available = isAccountAvailable(config, PRIVACY_CONTACT_EMAIL);
  return createAccountService({
    available,
    loadAdapter: async () => {
      if (config === null) throw new Error('No Firebase config');
      const { createFirebaseAdapter } = await import('./firebaseAdapter');
      return createFirebaseAdapter(config);
    },
    hint: createAccountHint(),
    network: browserNetwork,
    resetLocalProgress,
    ...(logError === undefined ? {} : { logError }),
  });
}
