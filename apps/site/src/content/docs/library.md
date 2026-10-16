---
title: Library API
label: Library
description: Use @rinci/secrets from code. Load secrets into an object, run a child process, build an environment, or register your own provider.
group: Reference
order: 3
---

Everything the CLI does is exported. The package is ESM-only and fully typed.

## loadSecrets

```ts
import { loadSecrets } from "@rinci/secrets"

const { secrets, sources } = await loadSecrets({ environment: "prod" })
// secrets: { DATABASE_URL: "...", ... }
// sources: [{ name: "infisical", provider: "infisical", keys: [...], ms: 184 }]
```

Options:

| Option        | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| `cwd`         | Where to search for the config. Default `process.cwd()`.          |
| `config`      | A path, an inline config object, or omitted to search.            |
| `environment` | Sets `${SECRETS_ENV}`.                                            |
| `sources`     | Only read these source names.                                     |
| `envFiles`    | Extra credential files. They must exist.                          |
| `env`         | The base environment. Default `process.env`. It is never mutated. |
| `log`         | A `Logger`. Use `silentLogger` to suppress output.                |
| `fetch`       | A `fetch` replacement, for tests.                                 |

It rejects with a `SecretsError` (with `message` and `hint`) when a required source fails.

`loadSecrets` does not touch `process.env`. To apply the values in-process, assign them yourself, as early as possible:

```ts
Object.assign(process.env, (await loadSecrets()).secrets)
```

Running the app as a child process with `run` is safer, because the credentials are then never in the app's process.

## runWithSecrets

```ts
import { runWithSecrets } from "@rinci/secrets"

const { code } = await runWithSecrets("bun", ["dev"], { environment: "dev", pure: true })
process.exitCode = code
```

It takes the `loadSecrets` options plus `override`, `pure` and `keepCredentials`.

## buildChildEnv

The function that decides what the child sees, exported for custom spawners:

```ts
import { buildChildEnv } from "@rinci/secrets"

const { env, added, overridden, withheld } = buildChildEnv(secrets, {
  base: process.env,
  override: true,
  withhold: ["DOPPLER_TOKEN"],
})
```

## Custom providers

```ts
import { defineProvider, registerProvider } from "@rinci/secrets"

registerProvider(
  defineProvider({
    name: "internal",
    description: "Our config service",
    credentials: ["INTERNAL_TOKEN"],
    withhold: ["INTERNAL_TOKEN"],
    async load(options, { env, fetch }) {
      const res = await fetch(`https://config.internal/${options.app}`, {
        headers: { Authorization: `Bearer ${env.INTERNAL_TOKEN}` },
      })
      return (await res.json()) as Record<string, string>
    },
  }),
)
```

Registered providers can be used in configs loaded by the same process. A provider with a built-in's name replaces it.

## Utilities

- `parseDotenv(text)` and `stringifyDotenv(values)`: a dotenv parser and writer that round-trip.
- `interpolate(text, env)`: `${VAR}` and `${VAR:-fallback}` expansion.
- `assertSecureUrl(url)` and `isPrivateHost(host)`: the transport rule.
- `signAwsRequest(...)`: AWS Signature V4 for JSON POST requests.
