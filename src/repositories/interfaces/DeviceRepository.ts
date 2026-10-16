/** Identity of this installation (DeviceMeta). Not user data: never exported, imported, reset or replaced. */
export interface DeviceRepository {
  /** The installation id; created (once) if the record is missing. */
  getDeviceId(): Promise<string>;
}
