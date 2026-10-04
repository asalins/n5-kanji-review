import { useRegisterSW } from 'virtual:pwa-register/react';

/** What the UI needs to know about a waiting new version. */
export interface PwaUpdate {
  /** A new version is installed and waiting; nothing changes until the user accepts it. */
  readonly updateReady: boolean;
  /** Activates the waiting version and reloads. Only ever called from the user's button press. */
  readonly applyUpdate: () => void;
  readonly dismiss: () => void;
}

/**
 * The PWA layer's only contact with the app: the service-worker update lifecycle. Registers the generated
 * service worker (asset caching only). No repository, IndexedDB, SRS, statistics or search access here.
 */
export function usePwaUpdate(): PwaUpdate {
  const {
    needRefresh: [updateReady, setUpdateReady],
    updateServiceWorker,
  } = useRegisterSW();
  return {
    updateReady,
    applyUpdate: () => void updateServiceWorker(true),
    dismiss: () => setUpdateReady(false),
  };
}
