import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '';
let env: RulesTestEnvironment;

beforeAll(async () => {
  if (HOST === '') throw new Error('FIRESTORE EMULATOR BLOCKED — FIRESTORE_EMULATOR_HOST is not set (no emulator running).');
  const [host, port] = HOST.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-n5',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: host!, port: Number(port) },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const log = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  cardId: 'kanji:kanji:U+6C34:A',
  rating: 'GOOD',
  reviewedAt: 1_800_000_000_000,
  durationMs: 1200,
  stateBefore: 'NEW',
  stateAfter: 'LEARNING',
  datasetVersion: 'n5-2026.10.11',
  deviceId: '0b5f2c9e-7a41-4d3b-9c2e-5f1a8b7c6d4e',
  originalId: null,
  epoch: 0,
  uploadedAt: serverTimestamp(),
  ...over,
});
const settings = (over: Record<string, unknown> = {}) => ({
  dailyNewCards: 10,
  dailyReviewLimit: 20,
  theme: 'system',
  uiLanguage: 'th',
  soundEnabled: false,
  autoPlay: false,
  studyMode: 'A',
  animationsEnabled: true,
  updatedAt: 1_800_000_000_000,
  uploadedAt: serverTimestamp(),
  ...over,
});
const userRoot = { schema: 1, epoch: 0, resetAt: null, createdAt: serverTimestamp() };

async function withUser(uid: string, epoch = 0): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `users/${uid}`), { schema: 1, epoch, resetAt: null, createdAt: 1 });
  });
}

describe('users/{uid}', () => {
  it('the owner creates the root document with epoch 0', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), userRoot));
  });
  it('nobody else creates, reads or deletes it; signed-out users get nothing', async () => {
    await assertFails(setDoc(doc(as('bob'), 'users/alice'), userRoot));
    await withUser('alice');
    await assertFails(getDoc(doc(as('bob'), 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'users/alice')));
    await assertFails(deleteDoc(doc(as('bob'), 'users/alice')));
  });
  it('a root document with extra fields or a non-zero start epoch is refused', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), { ...userRoot, extra: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice'), { ...userRoot, epoch: 3 }));
  });
  it('the epoch only goes up by exactly one (reset / import), never down or by jumps', async () => {
    await withUser('alice', 2);
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { epoch: 1, resetAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { epoch: 4, resetAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { schema: 2 }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { epoch: 3, resetAt: serverTimestamp() }));
  });
});

describe('users/{uid}/logs/{logId}', () => {
  it('the owner creates a valid log in the current epoch and reads it back', async () => {
    await withUser('alice');
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), log('log:1')));
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/logs/log:1')));
  });
  it('another user can neither read nor write it; signed-out users neither', async () => {
    await withUser('alice');
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), log('log:1')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/logs/log:1')));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/logs/log:2'), log('log:2')));
    await assertFails(getDoc(doc(anon(), 'users/alice/logs/log:1')));
    await assertFails(setDoc(doc(anon(), 'users/alice/logs/log:3'), log('log:3')));
  });
  it('logs are create-only: no update, no overwrite of an existing log', async () => {
    await withUser('alice');
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), log('log:1')));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice/logs/log:1'), { rating: 'EASY' }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), log('log:1', { rating: 'EASY' })));
  });
  it('D6: a log with a stale (or future) epoch is refused after a reset', async () => {
    await withUser('alice', 1);
    await assertFails(setDoc(doc(as('alice'), 'users/alice/logs/log:old'), log('log:old', { epoch: 0 })));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/logs/log:future'), log('log:future', { epoch: 2 })));
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/logs/log:new'), log('log:new', { epoch: 1 })));
  });
  it('no root document -> no logs (the epoch cannot be checked)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), log('log:1')));
  });
  it.each([
    ['an extra field', { extra: 1 }],
    ['a missing field', { durationMs: undefined }],
    ['an unknown rating', { rating: 'PERFECT' }],
    ['an unknown state', { stateAfter: 'DONE' }],
    ['a negative time', { reviewedAt: -1 }],
    ['a float duration', { durationMs: 1.5 }],
    ['a client upload time', { uploadedAt: 5 }],
    ['an id that is not the document id', { id: 'log:other' }],
    ['originalId on an id without ~', { originalId: 'log:x' }],
    ['a huge cardId', { cardId: 'x'.repeat(500) }],
  ])('refuses %s', async (_label, over) => {
    await withUser('alice');
    const data = log('log:1', over);
    if ('durationMs' in over && over.durationMs === undefined) delete (data as Record<string, unknown>).durationMs;
    await assertFails(setDoc(doc(as('alice'), 'users/alice/logs/log:1'), data));
  });
  it('a collision-renamed log (id~hash with originalId) is accepted', async () => {
    await withUser('alice');
    const id = 'kanji:kanji:U+6C34:A#1~0123456789abcdef';
    await assertSucceeds(setDoc(doc(as('alice'), `users/alice/logs/${id}`), log(id, { originalId: 'kanji:kanji:U+6C34:A#1' })));
  });
  it('the owner (only) deletes logs, in batches (reset / delete account)', async () => {
    await withUser('alice');
    for (const id of ['log:1', 'log:2']) await assertSucceeds(setDoc(doc(as('alice'), `users/alice/logs/${id}`), log(id)));
    await assertFails(deleteDoc(doc(as('bob'), 'users/alice/logs/log:1')));
    const batch = writeBatch(as('alice'));
    batch.delete(doc(as('alice'), 'users/alice/logs/log:1'));
    batch.delete(doc(as('alice'), 'users/alice/logs/log:2'));
    await assertSucceeds(batch.commit());
    await assertSucceeds(deleteDoc(doc(as('alice'), 'users/alice')));
  });
});

describe('users/{uid}/meta/settings', () => {
  it('the owner writes valid settings; others cannot read or write', async () => {
    await withUser('alice');
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/meta/settings'), settings()));
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/meta/settings'), settings({ theme: 'dark', updatedAt: 1_800_000_000_001 })));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/meta/settings')));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/meta/settings'), settings()));
  });
  it('refuses values outside the app rules, extra fields, and any other meta document', async () => {
    await withUser('alice');
    await assertFails(setDoc(doc(as('alice'), 'users/alice/meta/settings'), settings({ dailyNewCards: 7 })));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/meta/settings'), settings({ theme: 'blue' })));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/meta/settings'), settings({ extra: true })));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/meta/other'), settings()));
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(setDoc(doc(as('alice'), 'public/x'), { a: 1 }));
  });
});
