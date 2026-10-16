---
title: Google Cloud Secret Manager
label: Google Cloud
description: Read one bundle secret or a list of secrets from GCP Secret Manager with Application Default Credentials, a service account key or a token.
group: Providers
order: 5
---

One secret holding many values:

```json
{ "provider": "gcp", "project": "my-project", "secret": "myapp-${SECRETS_ENV:-dev}" }
```

Or one variable per secret:

```json
{
  "provider": "gcp",
  "project": "my-project",
  "secrets": { "DATABASE_URL": "db-url", "STRIPE_KEY": "stripe-key@3" }
}
```

`"secrets": ["DATABASE_URL", "STRIPE_KEY"]` uses each name for both the secret and the variable. `name@version` pins a version. The default is `latest`.

## Credentials

In order of precedence:

1. `GOOGLE_OAUTH_ACCESS_TOKEN`, for example from `gcloud auth print-access-token`.
2. `GOOGLE_APPLICATION_CREDENTIALS`, pointing at a service account key or an authorized-user file.
3. The gcloud default credentials file, written by `gcloud auth application-default login`.

Service account keys are exchanged for a token using a JWT signed locally, with a 10-minute lifetime. None of these variables are withheld, since Google client libraries in your app may use them.

## Options

| Option    | Default                |                                                                               |
| --------- | ---------------------- | ----------------------------------------------------------------------------- |
| `project` | `GOOGLE_CLOUD_PROJECT` | Project ID.                                                                   |
| `secret`  |                        | One secret expanded into many variables.                                      |
| `secrets` |                        | A list or map of secrets, one variable each.                                  |
| `format`  | `auto`                 | For `secret`. See [formats](/docs/providers#one-stored-value-many-variables). |
| `key`     |                        | For a plain-text `secret`.                                                    |

Set `secret`, `secrets` or both. Mapped secrets are read eight at a time.
