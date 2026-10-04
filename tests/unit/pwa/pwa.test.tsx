import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR, pwaManifest, pwaOptions } from '../../../pwa.config';
import { App } from '../../../src/app/App';
import { buildAppServices } from '../../../src/app/bootstrap';
import type { PwaUpdate } from '../../../src/app/pwaUpdate';
import { applyThemePreference, THEME_COLOR } from '../../../src/app/theme';
import { UpdateBanner } from '../../../src/app/UpdateBanner';
import { openRealRepositories } from '../../helpers/realData';

/** Width and height from a PNG file's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web app manifest', () => {
  it('has the required fields, the app identity and the approved colours', () => {
    expect(pwaManifest).toMatchObject({ id: '/', name: 'N5 Kanji Review', short_name: 'N5 Kanji', start_url: '/', scope: '/', display: 'standalone' });
    expect(pwaManifest.description.length).toBeGreaterThan(10);
    expect([PWA_THEME_COLOR, PWA_BACKGROUND_COLOR]).toEqual(['#b91c1c', '#fafaf9']);
    expect(pwaManifest).toMatchObject({ theme_color: '#b91c1c', background_color: '#fafaf9' });
    expect('orientation' in pwaManifest).toBe(false); // not locked (approved)
    expect(JSON.stringify(pwaManifest)).not.toMatch(/kioku/i);
  });

  it('declares 192, 512 and maskable 512 icons that exist with those pixel sizes', () => {
    const icons = pwaManifest.icons.map((i) => `${i.sizes}:${i.purpose}`).sort();
    expect(icons).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
    for (const icon of pwaManifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(`public${icon.src}`)).toEqual({ width: w, height: h });
    }
  });
});

describe('service worker configuration: assets only, user-controlled updates', () => {
  it('waits for the user to accept a new version (no auto update) and registers from the app', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.injectRegister).toBe(false);
  });
  it('precaches the app shell, the bundled dataset chunks and icons; caches no network/API responses', () => {
    expect(pwaOptions.workbox?.globPatterns).toEqual(['**/*.{js,css,html,svg,png,webmanifest}']);
    expect(pwaOptions.workbox?.runtimeCaching).toEqual([]);
    expect(pwaOptions.workbox?.navigateFallback).toBe('index.html');
    expect(JSON.stringify(pwaOptions.workbox)).not.toMatch(/json/); // backups are local .json files, never cached
  });
  it('index.html enables safe-area insets and a theme-color meta', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/name="viewport" content="[^"]*viewport-fit=cover/);
    expect(html).toMatch(/<meta name="theme-color" content="#fafaf9"/);
    expect(html).toMatch(/rel="icon" href="\/favicon.svg"/);
  });
});

describe('theme-color follows the theme actually shown', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });
  it('dark -> neutral-900, light -> stone-50, system without matchMedia -> light', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    applyThemePreference('dark');
    expect(meta.content).toBe(THEME_COLOR.dark);
    applyThemePreference('light');
    expect(meta.content).toBe(THEME_COLOR.light);
    applyThemePreference('dark');
    applyThemePreference('system')();
    expect(meta.content).toBe(THEME_COLOR.light);
  });
});

describe('update notice', () => {
  it('is hidden without an update and never applies it by itself', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<UpdateBanner visible={false} onUpdate={onUpdate} onDismiss={() => undefined} />);
    expect(screen.queryByText(/new version/)).toBeNull();
    rerender(<UpdateBanner visible onUpdate={onUpdate} onDismiss={() => undefined} />);
    expect(screen.getByText(/new version/)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Update/ }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('appears on the home screen only: never during a review, search or settings; Later dismisses it', async () => {
    const { repos, dispose } = await openRealRepositories();
    const applyUpdate = vi.fn();
    let ready = true;
    const fake = (): PwaUpdate => ({ updateReady: ready, applyUpdate, dismiss: () => (ready = false) });
    render(<App bootstrap={() => Promise.resolve(buildAppServices(repos))} useUpdate={fake} />);
    expect(await screen.findByText(/new version/)).toBeTruthy();
    for (const screenButton of [/Today's review/, /Search/, /Settings/]) {
      fireEvent.click(screen.getByRole('button', { name: screenButton }));
      expect(screen.queryByText(/new version/)).toBeNull();
      fireEvent.click(await screen.findByRole('button', { name: /Back|กลับ|Home|หน้าแรก/ }));
      await screen.findByRole('heading', { name: 'N5 Kanji Review' });
    }
    expect(applyUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    expect(applyUpdate).not.toHaveBeenCalled();
    await dispose();
  });
});
