---
name: redesign-ux-ui
description: Continuous UX/UI redesign of the N5 Kanji Review PWA that keeps every existing function working. Use when asked to redesign, restyle, polish, modernise, "make it look better", improve usability, or review the look of any screen (Home/Dashboard, Review/flashcards, Study, Search, Kanji Detail, Settings, About, Privacy), and before changing layout, colours, typography, motion or copy. Not for new features or data/SRS logic changes.
---

# Redesign UX/UI (function-preserving)

Redesign in small, reversible passes. A redesign that breaks a flow, a test, offline use or a stored setting is a regression, not a redesign.

Design taste comes from `references/frontend-design.md` (Anthropic's official `frontend-design` skill, vendored). Read it before the first design plan of a session. This file adds the rules that keep this app's behaviour intact.

## 0. Ground rules for this repo

- Stack: React 19 + Tailwind v4 (`src/index.css`, class-based dark mode via `.dark`), shared class strings in `src/components/styles.ts`, theme logic in `src/app/theme.ts`.
- Layer rules are enforced by `tests/unit/architecture.test.ts`: UI changes stay in `src/pages`, `src/features/*/` components and `src/components`. Never touch `src/services`, `src/repositories` or `src/types/schemas.ts` for a redesign.
- Japanese text uses `.font-jp` and `--kanji-font` (user-selectable in Settings; bundled subset fonts). Never replace these fonts or hard-code a kanji font: the subsets only cover the 196 N5 kanji + kana.
- Thai is a first-class language (UI strings in `features/*/strings.ts`). Thai needs taller line-height (≥ 1.6 for body) and must not be set in all-caps or with letter-spacing.
- Mobile first: 320/360/412 px portrait and 812x360 landscape must have no horizontal scroll (`tests/e2e/mobile.spec.ts`). Touch targets ≥ 44 px. Respect safe areas.
- Keep `prefers-reduced-motion` handling (see `.card-reveal`). Light, Dark and System themes must all pass contrast (WCAG AA: 4.5:1 text, 3:1 UI borders such as the file picker).
- Do not rename or remove `data-testid`, ARIA roles/labels, or visible button text that E2E tests select by, unless you update the tests in the same change and explain why.

## 1. Baseline (before any change)

1. Read the screen's page and feature components; list every user action and state on it (empty, loading, error, offline, update banner, account signed in/out).
2. Run the current checks and keep the result: `npm run typecheck && npm test` and the relevant `npx playwright test tests/e2e/<spec>`.
3. Capture "before" screenshots with Playwright at 360x800 and 412x915, light and dark (the `run` skill or a short Playwright script in the scratchpad). Look at them.

## 2. Design plan (no code yet)

Follow the two-pass process in `references/frontend-design.md`: a compact token plan (4–6 named colours for light and dark, type roles, spacing scale, radius scale by hierarchy, one memorable element), then review it against the generic-AI defaults listed there and revise. The subject is a calm, focused Japanese-study tool for Thai learners: the kanji is the hero, everything else is quiet.

Write down, per screen: what changes, what must not change (functions, order of actions, text meaning), and the risk.

## 3. Build in passes

- One screen or one cross-cutting concern (tokens, typography, buttons) per commit.
- Put tokens in `src/index.css` (`@theme` / CSS variables) and reuse them; avoid one-off hex values in components.
- Never change behaviour as a side effect: same handlers, same routes (`src/app/navigation.ts`), same settings keys, same confirm steps (`ConfirmPanel`).
- Copy changes: Thai and English stay equivalent in meaning; actions keep the same name through a flow.

## 4. Verify (every pass)

1. `npm run verify` (typecheck + unit tests + build) must pass.
2. Relevant E2E specs pass, always including `mobile.spec.ts`, `navigation.spec.ts`, `offline.spec.ts` and the spec for the screen touched.
3. "After" screenshots at the same sizes and themes; compare with "before" and critique (alignment, hierarchy, contrast, Thai wrapping, long kun readings such as 生).
4. Keyboard: visible focus, logical tab order. Screen reader names unchanged or better.
5. Report: what changed, before/after screenshots, test output, and anything that needs a real Android check (add it to `docs/release/android-checklist.md` style rows).

## Optional heavier tools (install only if the owner asks)

Popular community design skills, not vendored here because they ship large script bundles that have not been reviewed for this repo:
- Taste Skill (`npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend`) — redesign/review route with real-browser audits.
- UI/UX Pro Max (`nextlevelbuilder/ui-ux-pro-max-skill`) — searchable style/palette/typography database (Python scripts).
- Impeccable (`pbakaus/impeccable`) — anti-"AI slop" critique commands.
