import { CloudError, type CloudLogPage, type CloudRoot, type CloudStore } from '../../src/services/sync/cloudTypes';
import type { ReviewLog, SyncCursor, UserSettings } from '../../src/types/entities';

/**
 * In-memory stand-in for Firestore + firestore.rules, for UNIT tests of the sync engine only.
 * It mirrors what the rules enforce (owner only, create-only logs, the current epoch, epoch +1 only) and the
 * server upload time order. It is NOT evidence that the real rules or Firestore behave this way: that is what the
 * Emulator tests in CI are for (tests/emulator, tests/rules).
 */
interface Stored {
  readonly log: ReviewLog;
  readonly epoch: number;
  readonly at: { readonly seconds: number; readonly nanoseconds: number };
}
interface Account {
  root: { epoch: number; resetAt: number | null } | null;
  logs: Map<string, Stored>;
  settings: UserSettings | null;
}

export class MemoryCloud {
  private readonly accounts = new Map<string, Account>();
  private clock = 1_000;
  readonly ops = { pushes: 0, pulls: 0, logWrites: 0 };
  /** Every call throws this until cleared (offline, quota, ...). */
  failure: CloudError | null = null;
  /** Throws once, at the next call of this operation. */
  failOnce: { op: keyof CloudStore; error: CloudError } | null = null;
  /** Runs inside bumpEpoch before its check (another device acting between "read" and "commit"). */
  beforeBump: (() => void) | null = null;
  /** Tokens of every successful epoch raise. */
  readonly bumps: string[] = [];
  /**
   * F8: the next call of `op` hangs until `release()`. 'before' = the request has not reached the server yet (it
   * runs on release); 'after' = the server already applied it, only the answer is late.
   */
  private held: { op: keyof CloudStore; when: 'before' | 'after'; gate: Promise<void> } | null = null;
  hold(op: keyof CloudStore, when: 'before' | 'after'): { release: () => void } {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.held = { op, when, gate };
    return { release: () => release() };
  }

  account(uid: string): Account {
    let a = this.accounts.get(uid);
    if (a === undefined) {
      a = { root: null, logs: new Map(), settings: null };
      this.accounts.set(uid, a);
    }
    return a;
  }
  logsOf(uid: string): ReviewLog[] {
    return [...this.account(uid).logs.values()].map((s) => s.log).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  epochsOf(uid: string): number[] {
    return [...this.account(uid).logs.values()].map((s) => s.epoch);
  }

  /** The CloudStore as seen by a device signed in as `uid` (null = signed out). */
  as(getUid: () => string | null): CloudStore {
    const gate = <T>(op: keyof CloudStore, fn: () => T): Promise<T> => {
      if (this.failure !== null) return Promise.reject(this.failure);
      if (this.failOnce?.op === op) {
        const { error } = this.failOnce;
        this.failOnce = null;
        return Promise.reject(error);
      }
      const run = () => {
        try {
          return Promise.resolve(fn());
        } catch (error) {
          return Promise.reject(error);
        }
      };
      if (this.held?.op === op) {
        const { when, gate } = this.held;
        this.held = null;
        if (when === 'before') return gate.then(run);
        const answer = run();
        return gate.then(() => answer);
      }
      return run();
    };
    const owner = (uid: string) => {
      if (getUid() !== uid) throw new CloudError('denied', 'not the owner');
      return this.account(uid);
    };
    const tick = () => ({ seconds: (this.clock += 1), nanoseconds: 0 });
    const after = (s: Stored, c: SyncCursor) => s.at.seconds > c.seconds || (s.at.seconds === c.seconds && (s.at.nanoseconds > c.nanoseconds || (s.at.nanoseconds === c.nanoseconds && s.log.id > c.id)));

    return {
      confirmedUid: () => gate('confirmedUid', () => getUid()),
      readOrCreateRoot: (uid) =>
        gate('readOrCreateRoot', (): CloudRoot => {
          const a = owner(uid);
          if (a.root !== null) return { ...a.root, created: false };
          a.root = { epoch: 0, resetAt: null };
          return { epoch: 0, resetAt: null, created: true };
        }),
      bumpEpoch: (uid, from, token, settings) =>
        gate('bumpEpoch', () => {
          this.beforeBump?.();
          const a = owner(uid);
          // one atomic check-and-write, like the Firestore transaction (+ the rule: exactly +1, with a token)
          if (a.root === null || a.root.epoch !== from) throw new CloudError('conflict', 'epoch moved');
          if (token.length < 8) throw new CloudError('denied', 'replacedBy missing');
          a.root = { epoch: from + 1, resetAt: tick().seconds };
          if (settings !== null) a.settings = settings; // same transaction
          this.bumps.push(token);
          return from + 1;
        }),
      pullLogs: (uid, cursor, limit) =>
        gate('pullLogs', (): CloudLogPage => {
          this.ops.pulls += 1;
          const all = [...owner(uid).logs.values()]
            .filter((s) => cursor === null || after(s, cursor))
            .sort((x, y) => x.at.seconds - y.at.seconds || x.at.nanoseconds - y.at.nanoseconds || (x.log.id < y.log.id ? -1 : 1));
          const page = all.slice(0, limit);
          const last = page.at(-1);
          return {
            logs: page.map((s) => ({ ...s.log, epoch: s.epoch })),
            invalid: 0,
            cursor: last === undefined ? cursor : { ...last.at, id: last.log.id },
            last: page.length < limit,
          };
        }),
      pushLogs: (uid, epoch, logs) =>
        gate('pushLogs', () => {
          const a = owner(uid);
          this.ops.pushes += 1;
          // one batch: all or nothing, like a Firestore batched write under the rules
          if (a.root === null || a.root.epoch !== epoch) throw new CloudError('denied', 'stale epoch');
          if (logs.some((l) => a.logs.has(l.id))) throw new CloudError('denied', 'log exists (create-only)');
          const at = tick();
          for (const log of logs) a.logs.set(log.id, { log, epoch, at });
          this.ops.logWrites += logs.length;
        }),
      deleteLogsBelow: (uid, epoch) =>
        gate('deleteLogsBelow', () => {
          const a = owner(uid);
          let n = 0;
          for (const [id, s] of a.logs) if (s.epoch < epoch) (a.logs.delete(id), (n += 1));
          return n;
        }),
      readSettings: (uid) => gate('readSettings', () => owner(uid).settings),
      writeSettings: (uid, epoch, settings) =>
        gate('writeSettings', () => {
          const a = owner(uid);
          if (a.root === null || a.root.epoch !== epoch) throw new CloudError('conflict', 'epoch moved');
          a.settings = settings;
        }),
      deleteAll: (uid) =>
        gate('deleteAll', () => {
          owner(uid);
          this.accounts.delete(uid);
        }),
    };
  }
}
