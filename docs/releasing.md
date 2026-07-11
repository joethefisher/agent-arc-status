# Releasing

This repo publishes on a tag. Pushing `vX.Y.Z` triggers two workflows:

- `.github/workflows/release-npm.yml` — publishes the seven public `@agent-arc-status/*` npm packages.
- `.github/workflows/release-pypi.yml` — publishes `agent-arc-status` to PyPI.

The private `@agent-arc-status/conformance` runner is never published.

## Cut a release

1. Make sure `main` is green (CI runs the node matrix, the Python matrix, and the cross-language
   conformance gate).
2. Bump versions. Keep the seven publishable packages and `reference/python/pyproject.toml` on the
   same version. Note the split: the **protocol/spec** version (in `spec/`) moves independently of
   the **implementation** version — as of `0.3.0` the protocol is still `0.2`.
3. Add a `CHANGELOG.md` entry.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Watch both release runs. Then create a GitHub Release for the tag (mark it Latest).

Verify afterwards:

```bash
npm view @agent-arc-status/reference version      # -> X.Y.Z
pip index versions agent-arc-status               # or check pypi.org
```

> **First-publish propagation:** immediately after publishing, npm's read replicas can 404 a
> brand-new package/version for a minute or two. That's propagation lag, not failure — the publish
> log printing a signed provenance statement is proof the upload succeeded.

## Auth model

- **PyPI** uses **Trusted Publishing (OIDC)** — no token. A trusted publisher is configured on PyPI
  for this repo + `release-pypi.yml`.
- **npm** currently uses the repo secret **`NPM_TOKEN`** (a *granular* access token with **bypass
  2FA** enabled — classic/automation tokens were removed from npm in Nov 2025) and is **migrating to
  OIDC trusted publishing** (below). npm's OIDC cannot perform a package's *first* publish, which is
  why the initial `0.3.0` release used a token.

## Migrating npm to token-free OIDC trusted publishing

Goal: publish npm the same token-free way PyPI already does, then delete `NPM_TOKEN`. Safe because
npm **prefers OIDC and falls back to the token**, so nothing breaks mid-transition.

Requirements: **npm ≥ 11.5.1 and Node ≥ 22.14** on the runner (the workflow now runs
`npm install -g npm@latest` to satisfy this), `id-token: write` (already set), and one trusted
publisher **per package**.

**Phase 1 — configure trusted publishers (npmjs.com).** For each of the seven packages, at
`npmjs.com/package/<name>/access` → *Trusted Publishers* → add a GitHub Actions publisher:

| Field | Value |
|---|---|
| Organization or user | `joethefisher` |
| Repository | `agent-arc-status` |
| Workflow filename | `release-npm.yml` (filename only) |
| Environment | *(blank)* |
| Allowed actions | `npm publish` |

Packages: `@agent-arc-status/` `reference`, `emitter`, `cli`, `dashboard`, `adapter-otel`,
`adapter-mcp`, `adapter-langchain`. This is additive — the token keeps working.

**Phase 2 — workflow (done).** `release-npm.yml` upgrades npm to a version that supports OIDC and
keeps `id-token: write`, `--provenance`, and the `NODE_AUTH_TOKEN` fallback. Once trusted publishers
exist, npm uses OIDC first and falls back to the token only if OIDC is unavailable.

**Phase 3 — verify.** On the next release, confirm the publish authenticated via OIDC (the run does
not depend on the token).

**Phase 4 — cut the cord.** Remove the `NODE_AUTH_TOKEN` step from `release-npm.yml`, delete the
secret (`gh secret delete NPM_TOKEN`), and revoke the token on npmjs.com.

**Rollback:** in Phases 2–3 the token fallback still publishes if OIDC misfires. After Phase 4, if
OIDC ever breaks, re-add the secret and the `NODE_AUTH_TOKEN` step. The trusted publisher matches on
the **exact workflow filename** — if `release-npm.yml` is renamed, update the publisher config.

## Build gotchas (why the workflows look the way they do)

- Packages have **no `prepare` script**: it ran `tsc` during `npm ci`, before the workspace's
  reference package was built, and npm workspaces don't reliably honor `--ignore-scripts` for
  `prepare`. Publishing builds explicitly (`npm run build`, reference first) before `npm publish`.
- The root `build` builds `@agent-arc-status/reference` **explicitly first**, because npm's
  `--workspaces` iteration order is not topological across npm versions.
- `.gitattributes` forces **LF** so the conformance corpus `sha256` manifest matches on Windows.
