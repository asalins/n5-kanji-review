import { create } from 'zustand';

export type BootState = 'booting' | 'ready' | 'failed';

interface AppState {
  readonly bootState: BootState;
  readonly bootError: string | null;
  markBooting: () => void;
  markReady: () => void;
  markFailed: (message: string) => void;
}

/**
 * Application-level state only. Review/SRS/settings state belongs to later phases.
 */
export const useAppStore = create<AppState>((set) => ({
  bootState: 'booting',
  bootError: null,
  markBooting: () => set({ bootState: 'booting', bootError: null }),
  markReady: () => set({ bootState: 'ready', bootError: null }),
  markFailed: (message) => set({ bootState: 'failed', bootError: message }),
}));
