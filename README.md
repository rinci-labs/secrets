# RINCI Secrets

One entry point for every secrets manager. This repository holds:

| Path                                   | What                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`packages/secrets`](packages/secrets) | `@rinci/secrets`, the CLI and library, published to npm.                                                 |
| [`apps/site`](apps/site)               | [secrets.rin.ci](https://secrets.rin.ci), the landing page and docs. Astro, static, on Cloudflare Pages. |

## Develop

Needs [Bun](https://bun.sh) (version in `.bun-version`).

```sh
bun install
bun run dev          # the site at http://localhost:4321
bun run test         # package tests
bun run ci           # lint, format check, typecheck, test, build: what CI runs
```

| Script                    |                                                    |
| ------------------------- | -------------------------------------------------- |
| `lint` / `lint:fix`       | [oxlint](https://oxc.rs/docs/guide/usage/linter)   |
| `format` / `format:check` | [oxfmt](https://oxc.rs/docs/guide/usage/formatter) |
| `typecheck`               | `tsc` for the package, `astro check` for the site  |
| `test`                    | `bun test`                                         |
| `build`                   | Both workspaces                                    |

## Release the package

Bump the version in `packages/secrets/package.json`, commit, then tag:

```sh
git tag v0.1.1
git push --follow-tags
```

The `release` workflow tests, builds and publishes via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC). No `NPM_TOKEN` secret. On npmjs.com, package Settings → Trusted Publisher → GitHub Actions: org `rinci-labs`, repo `secrets`, workflow `release.yml`, allow `npm publish`.

## Deploy the site

The site is static and builds to `apps/site/dist`. Cloudflare Pages deploys it through its Git integration: `main` to production, every other branch to a preview URL. The Pages project uses:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Framework preset | None                                         |
| Root directory   | `/`                                          |
| Build command    | `bun run --filter @rinci/secrets-site build` |
| Build output     | `apps/site/dist`                             |

Pages reads `.bun-version` and `.node-version` from the repository root and runs `bun install --frozen-lockfile` itself. Node is pinned because Astro needs a newer release than the build image's default. The build fails if any page is missing its share card or has a broken link. `secrets.rin.ci` is the custom domain on the project.

From a laptop, `bun run --filter @rinci/secrets-site deploy` builds and uploads directly.

Security headers are in `apps/site/public/_headers`. Astro writes the script and style policy into each page as a hashed CSP `<meta>` tag (see `security.csp` in `astro.config.mjs`).

## License

MIT. Security reports: see [SECURITY.md](SECURITY.md).
