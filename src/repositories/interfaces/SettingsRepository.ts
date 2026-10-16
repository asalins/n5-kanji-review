import type { UserSettings } from '../../types/entities';

export interface SettingsRepository {
  get(): Promise<UserSettings | null>;
  /** Stores the settings and stamps updatedAt with the current time (the caller's updatedAt is ignored). */
  save(settings: UserSettings): Promise<void>;
}
