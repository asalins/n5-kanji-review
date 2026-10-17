/**
 * L4-C1 (F2): why a Reset progress / Import (Replace) on a device bound to an account was refused or did not finish.
 *  - offline / not-signed-in / not-synced / cloud-failed / conflict: refused BEFORE anything changed (nothing local,
 *    nothing in the cloud);
 *  - local-failed: the cloud epoch WAS raised, but the local write failed: this device's data is unchanged and no
 *    cloud log was deleted (old-epoch logs are only deleted after the local write); the device then sees the
 *    "replaced from another device" notice and the user decides.
 */
export type ReplaceErrorCode = 'offline' | 'not-signed-in' | 'not-synced' | 'cloud-failed' | 'conflict' | 'local-failed';

export class ReplaceError extends Error {
  constructor(
    readonly code: ReplaceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ReplaceError';
  }
}
