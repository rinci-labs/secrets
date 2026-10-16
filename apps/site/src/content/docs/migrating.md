---
title: Migrating a hand-rolled script
label: Migrating a script
description: Replace a copied dev-with-secrets.mjs with one config file. Same behaviour, plus timeouts, token revocation, credential withholding and safe argument handling.
group: Guides
order: 1
---

Many repos carry a script like `scripts/dev-with-infisical.mjs`. It loads a credentials file, logs in, fetches secrets and spawns the real command. It works, but every copy drifts. Most share the same gaps:

- `spawn(args.join(" "), { shell: true })` sends every argument through a shell again. Quotes are lost, and a value with `&` or `|` can run a second command.
- The machine identity's client secret is passed to the app along with the secrets.
- A slow or unreachable API hangs forever, because nothing sets a timeout.
- The access token stays valid until it expires on its own.
- Ctrl+C and exit codes behave differently on Windows and everywhere else.

## Before

```js
const DOMAIN = process.env.INFISICAL_DOMAIN || "http://10.0.0.12:8080"
const PROJECT_ID = process.env.INFISICAL_PROJECT_ID || "your-project-id"
let ENVIRONMENT = process.env.INFISICAL_ENV || "prod"
// ...load .env.infisical, log in, GET /api/v4/secrets, then:
spawn([command, ...args].join(" "), { stdio: "inherit", shell: true, env: { ...process.env, ...injected } })
```

```json
{ "scripts": { "dev": "bun scripts/dev-with-infisical.mjs --env=prod bun dev" } }
```

## After

```json
{
  "$schema": "https://secrets.rin.ci/schema.json",
  "envFiles": [".env.infisical"],
  "sources": [
    {
      "provider": "infisical",
      "domain": "${INFISICAL_DOMAIN:-http://10.0.0.12:8080}",
      "projectId": "${INFISICAL_PROJECT_ID:-your-project-id}",
      "environment": "${SECRETS_ENV:-prod}"
    }
  ]
}
```

Fallbacks do not nest, so pick one variable for the environment. `-e` sets `SECRETS_ENV`; if your team exports `INFISICAL_ENV` today, write `"${INFISICAL_ENV:-prod}"` instead.

```json
{ "scripts": { "dev": "rinci-secrets run -e prod -- bun dev" } }
```

Then delete the script. The `.env.infisical` file keeps working unchanged.

## What maps to what

| Script                                                | rinci-secrets                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `.env.infisical` loaded with `process.loadEnvFile`    | `"envFiles": [".env.infisical"]`, never passed to the app             |
| `INFISICAL_DOMAIN` / `INFISICAL_PROJECT_ID` fallbacks | `${VAR:-fallback}` in the config, or the provider's built-in env vars |
| `--env=name`                                          | `-e name` (sets `${SECRETS_ENV}`)                                     |
| `shell: true` and joined args                         | direct spawn, Windows `.cmd` shims escaped                            |
| `taskkill /T /F` on SIGTERM                           | the same on Windows, signal forwarding elsewhere                      |
| `"Injecting N Infisical secrets"`                     | `N secrets from infisical N (Xms)`, plus names with `-v`              |

## Private, in-cluster APIs

Self-hosted Infisical reached over WARP, Tailscale or a VPN often listens on plain HTTP at a private address, for example `http://10.43.0.10:8080` or `http://infisical.ns.svc.cluster.local:8080`. Plain HTTP is allowed for private and cluster-local hosts. It is refused for public ones unless you set `"allowInsecure": true` on the source. A public hostname behind Cloudflare Access will not work from a script either way. Point the tool at the private address your network client can reach.
