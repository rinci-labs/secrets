---
title: Configuration
description: The secrets.config.json format. Sources, merge order, environments, credential files and the options that shape the child environment.
group: Start
order: 2
---

The CLI looks for `secrets.config.json` (or `.secretsrc.json`) in the working directory, then in each parent directory up to the repository root. Pass `--config <path>` to use a specific file. Relative paths in the config resolve against the config file's directory.

## A full example

```json
{
  "$schema": "https://secrets.rin.ci/schema.json",
  "envFiles": [".env.infisical", ".env.doppler"],
  "sources": [
    {
      "provider": "infisical",
      "projectId": "your-project-id",
      "environment": "${SECRETS_ENV:-dev}",
      "path": "/api"
    },
    { "provider": "doppler", "name": "shared", "optional": true },
    { "provider": "dotenv", "name": "local", "path": ".env.local", "required": false }
  ],
  "override": true,
  "pure": false,
  "keepCredentials": false
}
```

## Top-level keys

| Key               | Default  | Meaning                                                        |
| ----------------- | -------- | -------------------------------------------------------------- |
| `sources`         | required | Where to read secrets from. At least one.                      |
| `envFiles`        | `[]`     | Files holding provider credentials. Missing files are skipped. |
| `override`        | `true`   | Replace variables already set in the environment.              |
| `pure`            | `false`  | Start the command from a minimal environment plus the secrets. |
| `keepCredentials` | `false`  | Pass provider credentials through to the command.              |

Unknown keys are an error, so a typo does not silently do nothing.

## Sources

Every source has a `provider` and that provider's options, listed on its [provider page](/docs/providers). Three options work on any source:

- **`name`**: a label for logs and `--source`. It defaults to the provider name, and must be unique when a provider appears twice.
- **`optional`**: when `true`, a failure is logged and the source is skipped. Otherwise any failure stops the run before the command starts.
- **`timeoutMs`**: the per-request timeout, 15 seconds by default.

### Merge order

Sources are read in parallel, then merged in the order they are listed. When two sources set the same key, **the later one wins**. A common layout puts shared values first, the app's own values next, and a local override file last.

`rinci-secrets list` shows which source each key came from, and marks the ones another source replaced.

### Picking sources per run

```sh
rinci-secrets run --source infisical -- bun dev
rinci-secrets run -s infisical -s local -- bun dev
```

## Environments and interpolation

Any string in a source can reference environment variables:

- `${NAME}` is replaced by the variable's value. If it is unset or empty, that is an error, so a typo cannot point the fetch at the wrong project.
- `${NAME:-fallback}` uses `fallback` when the variable is unset or empty.
- `$$` is a literal `$`.

`-e` / `--env` sets `SECRETS_ENV` for interpolation. That gives one switch for every provider, whatever it calls an environment:

```json
{
  "sources": [
    { "provider": "infisical", "projectId": "abc", "environment": "${SECRETS_ENV:-dev}" },
    { "provider": "aws", "region": "eu-west-1", "secretId": "myapp/${SECRETS_ENV:-dev}" },
    { "provider": "doppler", "config": "${SECRETS_ENV:-dev}" }
  ]
}
```

Interpolation reads the real environment plus the `envFiles`, so a credentials file can also hold settings like `INFISICAL_PROJECT_ID`.

## Credential files

`envFiles` lists dotenv files that hold what the providers log in with. They are read before anything else and follow two rules:

1. The real environment wins. A variable already set is not replaced by a file. CI can set credentials directly and skip the files.
2. Their contents are only visible to providers and interpolation. They are never added to your command's environment.

`--env-file <path>` adds more files from the command line. Unlike config entries, a file passed this way must exist.

The config itself must never contain credentials. Source options named like `token`, `password`, `clientSecret` or `privateKey` are rejected with an error.

## The child environment

The command starts with the current environment, plus the secrets, minus provider credentials.

- **`override`** (`--no-override` to turn off): when `false`, a variable that is already set keeps its value, and the run reports which secrets were skipped.
- **`pure`** (`--pure`): start from a minimal set (`PATH`, `HOME`, locale, temp directories and the Windows system variables) instead of everything. Useful to prove an app gets nothing it should not.
- **`keepCredentials`** (`--keep-credentials`): by default, variables such as `INFISICAL_CLIENT_SECRET`, `DOPPLER_TOKEN` and `VAULT_TOKEN` are removed before the command starts. Your app needs the secrets, not the identity that fetched them. General cloud credentials such as `AWS_ACCESS_KEY_ID` are never removed, because apps often use them directly.

On Windows, variable names are matched without regard to case, as Windows does.

## Without a config file

For one provider and a few options, flags are enough:

```sh
rinci-secrets run -p doppler -- bun dev
rinci-secrets run -p infisical --set projectId=abc --set environment=prod -- bun start
```

`--set` only takes string values. Use a config file for lists and maps.

## Editor support

The `$schema` line gives autocomplete and validation in VS Code, Cursor and any editor that reads JSON Schema. The schema is served at [/schema.json](/schema.json) and ships in the package as `@rinci/secrets/schema.json`.
