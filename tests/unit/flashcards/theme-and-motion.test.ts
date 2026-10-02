import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { applyThemePreference } from '../../../src/app/theme';

afterEach(() => document.documentElement.classList.remove('dark'));

describe('theme (existing class-based dark mode)', () => {
  it('Light and Dark set or clear the dark class', () => {
    applyThemePreference('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyThemePreference('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  it('System does not crash when matchMedia is unavailable', () => {
    expect(() => applyThemePreference('system')()).not.toThrow();
  });
});

describe('reduced motion', () => {
  it('the card reveal animation only runs when the user has no reduced-motion preference, and is 200-400 ms', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const guard = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    const animations = [...css.matchAll(/animation:\s*card-reveal\s+(\d+)ms/g)];
    expect(guard).toBeGreaterThan(-1);
    expect(animations).toHaveLength(1); // the only use of the animation ...
    expect(animations[0]!.index!).toBeGreaterThan(guard); // ... is inside the no-preference block
    const ms = Number(animations[0]![1]);
    expect(ms).toBeGreaterThanOrEqual(200);
    expect(ms).toBeLessThanOrEqual(400);
  });
});
