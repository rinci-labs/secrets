---
title: Infisical
description: Infisical Cloud or self-hosted, through a Universal Auth machine identity or an access token. Imports and secret references resolved.
group: Providers
order: 1
---

```json
{
  "provider": "infisical",
  "domain": "https://app.infisical.com",
  "projectId": "your-project-id",
  "environment": "${SECRETS_ENV:-dev}",
  "path": "/"
}
```

## Credentials

| Variable                                           |                                                    |
| -------------------------------------------------- | -------------------------------------------------- |
| `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`   | A Universal Auth machine identity. Recommended.    |
| `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`, `..._SECRET` | The same, under the official CLI's names.          |
| `INFISICAL_TOKEN`                                  | A ready access token. Used as-is, and not revoked. |

With a machine identity, the tool logs in, reads, then revokes the access token it was issued.

## Options

| Option        | Default                                  |                                             |
| ------------- | ---------------------------------------- | ------------------------------------------- |
| `environment` | required                                 | Environment slug: `dev`, `staging`, `prod`. |
| `projectId`   | `INFISICAL_PROJECT_ID`                   | The project ID.                             |
| `domain`      | `INFISICAL_DOMAIN`, then Infisical Cloud | The base URL, without `/api`.               |
| `path`        | `/`                                      | Folder path.                                |
| `recursive`   | `false`                                  | Include sub-folders.                        |

Secret imports are included, with the folder's own values taking precedence. Secret references like `${dev.DB_URL}` are expanded by Infisical before they arrive.

## Self-hosted behind Zero Trust

When the public hostname sits behind Cloudflare Access or a similar gate, point `domain` at the private address your network client can reach, for example the in-cluster service over WARP:

```json
{ "provider": "infisical", "domain": "http://10.43.0.10:8080", "projectId": "...", "environment": "prod" }
```

Plain HTTP is accepted because the host is private. See [transport](/docs/security#transport).
