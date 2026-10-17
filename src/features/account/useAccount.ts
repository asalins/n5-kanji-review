import { useSyncExternalStore } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { AccountService, AccountStatus } from '../../services/account';

const UNAVAILABLE: AccountStatus = { kind: 'unavailable' };
const noop = () => () => undefined;

/** The account service (absent in tests that do not need it) and its current status. */
export function useAccount(): { service: AccountService | null; status: AccountStatus } {
  const { account } = useRepositories();
  const status = useSyncExternalStore(account?.subscribe ?? noop, account?.getStatus ?? (() => UNAVAILABLE));
  return { service: account ?? null, status };
}
