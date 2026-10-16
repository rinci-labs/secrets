---
title: Getting started
description: Install @rinci/secrets, point it at your secrets manager, and run your app with the values injected. About two minutes.
group: Start
order: 1
---

`@rinci/secrets` is a command-line tool and a library. It reads secrets from one or more secrets managers and starts your command with them in its environment. The config file says where secrets live. Credentials come from the environment, and the values only ever exist in memory and in the child process.

## Install

Works with Bun and Node 20.10 or newer. It has no runtime dependencies.

```sh
bun add -d @rinci/secrets
```

Or with npm, pnpm or yarn:

```sh
npm install --save-dev @rinci/secrets
```

This installs two names for the same command: `rinci-secrets`, and `rsec` for when you type it by hand. The docs use the long name because it reads better in a `package.json`.

## Create a config

`init` writes a starter `secrets.config.json` for a provider. It defaults to Infisical:

```sh
bunx rinci-secrets init infisical
```

```json
{
  "$schema": "https://secrets.rin.ci/schema.json",
  "envFiles": [".env.infisical"],
  "sources": [
    {
      "provider": "infisical",
      "domain": "https://app.infisical.com",
      "projectId": "your-project-id",
      "environment": "${SECRETS_ENV:-dev}",
      "path": "/"
    }
  ]
}
```

Commit this file. It holds no credentials, and the loader refuses any key that looks like one.

## Add credentials

Put the machine identity in the file named by `envFiles`, and make sure git ignores it:

```sh
# .env.infisical
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
```

Variables already in the environment take precedence over the file, so CI can set them directly instead.

## Run something

```sh
bunx rinci-secrets run -- bun dev
bunx rinci-secrets run -e prod -- bun start
```

`-e prod` sets `${SECRETS_ENV}`, which the config above uses for the Infisical environment. Without it the fallback, `dev`, applies.

Every run reports what it did on stderr:

```
secrets 42 secrets from infisical 42 (184ms)
secrets overriding 1 existing: NODE_ENV
```

Add `-v` to see the names that were injected and the credentials that were withheld from your command. Values are never printed by `run`.

## Use it from package.json

```json
{
  "scripts": {
    "dev": "rinci-secrets run -- bun dev",
    "start": "rinci-secrets run -e prod -- bun start"
  }
}
```

## Check access

`check` logs in to every source and reports what it found, without printing any value. Use it after changing credentials, or as a CI step:

```sh
bunx rinci-secrets check -e prod
```

```
ok   infisical 42 keys · 184ms
```

## Next

- [Configuration](/docs/configuration) covers several sources, merging, environments and the full schema.
- [Providers](/docs/providers) lists what each secrets manager needs.
- [Security](/docs/security) explains what the tool protects against, and what it does not.
