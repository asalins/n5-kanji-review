import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountSection, deleteMessage } from '../../../src/features/account/AccountSection';
import { PrivacyScreen } from '../../../src/features/account/PrivacyScreen';
import { ACCOUNT_TEXT, PRIVACY_LINKS, PRIVACY_TEXT } from '../../../src/features/account/strings';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import type { AccountService } from '../../../src/services/account';
import { settle, setup } from './fakeAuth';

const renderSection = (account: AccountService | undefined, onPrivacy: () => void = () => undefined) =>
  render(
    <RepositoriesProvider value={{ ...(account === undefined ? {} : { account }) } as unknown as AppRepositories}>
      <AccountSection onPrivacy={onPrivacy} />
    </RepositoriesProvider>,
  );

describe('Account section', () => {
  it('is not rendered at all when the account is unavailable (no config / no contact) or absent', () => {
    renderSection(setup({ available: false }).service);
    expect(screen.queryByTestId('account-section')).toBeNull();
    renderSection(undefined);
    expect(screen.queryByTestId('account-section')).toBeNull();
  });

  it('signed out: optional notice, privacy link before sign-in, Google sign-in button', () => {
    let opened = 0;
    renderSection(setup().service, () => {
      opened += 1;
    });
    expect(screen.getByText(ACCOUNT_TEXT.optional)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.readPrivacy }));
    expect(opened).toBe(1);
    expect(screen.getByRole('button', { name: ACCOUNT_TEXT.signIn })).toBeTruthy();
  });

  it('signed in: e-mail, sign out "on this device" with its scope; no "all devices" wording anywhere', async () => {
    const { service } = setup();
    renderSection(service);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.signIn }));
      await settle();
    });
    expect(screen.getByTestId('account-email').textContent).toBe('learner@example.com');
    expect(screen.getByRole('button', { name: ACCOUNT_TEXT.signOut })).toBeTruthy();
    expect(screen.getByText(ACCOUNT_TEXT.signOutScope)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/ทุกอุปกรณ์|all devices/i);
  });

  it('sign out: the delete-local box is NOT pre-ticked, the shared-device warning is shown, data kept by default', async () => {
    const { service, events } = setup();
    renderSection(service);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.signIn }));
      await settle();
    });
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.signOut }));
    expect((screen.getByTestId('delete-local-progress') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(ACCOUNT_TEXT.sharedDevice)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.signOutConfirm }));
      await settle();
    });
    expect(screen.getByTestId('account-message').textContent).toContain(ACCOUNT_TEXT.localKept);
    expect(events.resets).toBe(0);
  });

  it('delete: needs "I understand"; box not pre-ticked; account deleted but local failed -> separate lines + retry', async () => {
    const { service } = setup({ resetFails: true });
    renderSection(service);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.signIn }));
      await settle();
    });
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_TEXT.deleteAccount }));
    const confirm = screen.getByRole('button', { name: ACCOUNT_TEXT.deleteConfirm }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect((screen.getByTestId('delete-local-progress') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId('delete-local-progress'));
    fireEvent.click(screen.getByLabelText(ACCOUNT_TEXT.understand));
    await act(async () => {
      fireEvent.click(confirm);
      await settle();
    });
    const text = screen.getByTestId('account-message').textContent ?? '';
    expect(text).toContain(ACCOUNT_TEXT.accountDeleted);
    expect(text).toContain(ACCOUNT_TEXT.noCloudData);
    expect(text).toContain(ACCOUNT_TEXT.localFailed);
    expect(screen.getByRole('button', { name: ACCOUNT_TEXT.retryLocal })).toBeTruthy();
  });

  it('delete messages never claim "everything deleted" nor cloud deletion', () => {
    const all = [
      deleteMessage({ account: 'deleted', reason: null, cloudData: 'none', localData: 'deleted' }),
      deleteMessage({ account: 'deleted', reason: null, cloudData: 'none', localData: 'kept' }),
      deleteMessage({ account: 'not-deleted', reason: 'cancelled', cloudData: 'none', localData: 'kept' }),
      deleteMessage({ account: 'failed', reason: 'network', cloudData: 'none', localData: 'kept' }),
    ].flatMap((m) => m.lines).join(' ');
    expect(all).not.toMatch(/ทั้งหมด|everything|all data|ลบถาวรทุกที่|deleted (from|in) the cloud/i);
    expect(deleteMessage({ account: 'not-deleted', reason: 'cancelled', cloudData: 'none', localData: 'kept' }).lines).toEqual([ACCOUNT_TEXT.deleteCancelled]);
  });
});

describe('Privacy screen (C3)', () => {
  it('Thai and English, the contact e-mail in both, provider policy links, no over-promises', () => {
    render(<PrivacyScreen onBack={() => undefined} />);
    const text = document.body.textContent ?? '';
    expect(screen.getByRole('heading', { name: PRIVACY_TEXT.th.heading })).toBeTruthy();
    expect(screen.getByRole('heading', { name: PRIVACY_TEXT.en.heading })).toBeTruthy();
    expect(text.split('n5kanjireview.support@gmail.com').length - 1).toBe(2);
    expect(screen.getByRole('link', { name: PRIVACY_TEXT.googleLink }).getAttribute('href')).toBe(PRIVACY_LINKS.google);
    expect(screen.getByRole('link', { name: PRIVACY_TEXT.firebaseLink }).getAttribute('href')).toBe(PRIVACY_LINKS.firebase);
    expect(text).toMatch(/180/); // the provider's stated retention, attributed to Firebase
    expect(text).not.toMatch(/ลบข้อมูลทั้งหมด|ลบถาวรทุกที่|permanently deleted everywhere|all your data is deleted/i);
    for (const part of [PRIVACY_TEXT.th, PRIVACY_TEXT.en]) expect(part.sections).toHaveLength(7);
  });
});
