---
title: Doppler
description: Doppler configs through a service token. Project and config are implied by the token, or set explicitly with a personal token.
group: Providers
order: 2
---

```json
{ "provider": "doppler" }
```

## Credentials

`DOPPLER_TOKEN`. A service token is scoped to a single config, so no other option is needed. With a personal or CLI token, set `project` and `config`.

## Options

| Option    | Default                                            |                                                 |
| --------- | -------------------------------------------------- | ----------------------------------------------- |
| `project` | from the token                                     | Project name.                                   |
| `config`  | from the token                                     | Config name, for example `${SECRETS_ENV:-dev}`. |
| `apiHost` | `DOPPLER_API_HOST`, then `https://api.doppler.com` | For proxies.                                    |

Doppler adds `DOPPLER_PROJECT`, `DOPPLER_CONFIG` and `DOPPLER_ENVIRONMENT` to every config. They are passed through like any other secret.
