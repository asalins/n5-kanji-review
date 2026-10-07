# Deployment (Cloudflare Pages)

## Settings in use
| Setting | Value |
|---|---|
| Git repository | `asalins/n5-kanji-review` (GitHub) |
| Production branch | `ui-import-button` |
| Automatic deployments | Enabled |
| Build command | `npm run build` |
| Build output | `dist` |
| Root directory | (empty) |
| Environment variable | `NODE_VERSION` = `22` (Vite requires Node `^20.19.0` or `>=22.12.0`) |
| Build system | Version 3 |
| Production URL | `https://n5-kanji-review.pages.dev` |

The app is a static site: no Functions, no `_worker.js`, no server-side code, no runtime environment variables.

## Rules
- **No push to the production branch without a Gate decision.** With automatic deployments enabled, every push to `ui-import-button` goes to production.
- `thai-review-1` is frozen at `7f3cf7d` (rollback target). Do not push to it.
- Never use `git push --force`.
- Use only the production domain for user data; each deployment URL (`<hash>.n5-kanji-review.pages.dev`) and each branch alias is a separate origin with its own IndexedDB.

## Testing an update without touching production (preview alias)
Used for the PWA update test #13:
1. Push the current production commit to a new branch, e.g. `git push origin <old-sha>:refs/heads/pwa-update-test`. Cloudflare builds a Preview with a stable branch alias `https://pwa-update-test.n5-kanji-review.pages.dev`.
2. Open the alias, create data (reviews, settings), note the values; do not clear site data.
3. Fast-forward the same branch to the new commit (`git push origin <new-branch>:refs/heads/pwa-update-test`, no `--force`).
4. Reload Home: the prompt "A new version is available" must appear on Home only, nothing reloads by itself, "Update" reloads once, data and settings are unchanged.

## Promoting a commit to production
- Changing the production branch does **not** create a deployment by itself (Cloudflare deploys on push). A commit already pushed before the change stays a Preview.
- Method used for 29d5354: Settings → Build → Deploy Hooks → create a hook for the production branch → `Invoke-RestMethod -Method Post -Uri "<hook URL>"` → the HEAD of the branch is built as Production (no new commit) → **delete the hook immediately**. The hook URL is a secret: never paste it into chats or documents.
- After promotion check the Deployments page: Production = expected branch and commit, Success; the previous production deployment is still listed.

## Rollback
Deployments → the previous **Production** deployment (currently `thai-review-1 · 7f3cf7d`) → "..." → Rollback. Preview deployments cannot be rollback targets. A rollback changes what the production URL serves; it does not change Git branches. Decide rollbacks through a Gate.
