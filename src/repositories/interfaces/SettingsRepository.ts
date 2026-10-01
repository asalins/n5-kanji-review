import type { UserSettings } from '../../types/entities';

export interface SettingsRepository {
  get(): Promise<UserSettings | null>;
  save(settings: UserSettings): Promise<void>;
}
