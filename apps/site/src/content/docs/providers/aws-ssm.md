---
title: AWS Systems Manager Parameter Store
label: AWS Parameter Store
description: Every parameter under a path, or a chosen list, from AWS Systems Manager Parameter Store. SecureStrings decrypted, no SDK.
group: Providers
order: 5
---

```json
{ "provider": "aws-ssm", "region": "eu-west-1", "path": "/myapp/${SECRETS_ENV:-dev}" }
```

Every parameter below the path becomes a variable named after the rest of its path. `/myapp/prod/DATABASE_URL` becomes `DATABASE_URL`, and `/myapp/prod/stripe/KEY` becomes `stripe_KEY`. `SecureString` values are decrypted, which needs `kms:Decrypt` on their key.

## Credentials

The same as [AWS Secrets Manager](/docs/providers/aws#credentials): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and optionally `AWS_SESSION_TOKEN`, left in the command's environment. Export profiles and SSO sessions first:

```sh
eval "$(aws configure export-credentials --profile dev --format env)"
rinci-secrets run -- bun dev
```

The identity needs `ssm:GetParametersByPath` for a path, or `ssm:GetParameters` for a list.

## Options

| Option       | Default                                 |                                                                    |
| ------------ | --------------------------------------- | ------------------------------------------------------------------ |
| `path`       |                                         | Read every parameter below this path.                              |
| `recursive`  | `true`                                  | Include nested paths. `false` reads only the path's own level.     |
| `parameters` |                                         | A list of full names, or `{ "ENV_NAME": "/full/name" }` to rename. |
| `region`     | `AWS_REGION`, then `AWS_DEFAULT_REGION` |                                                                    |
| `endpoint`   | regional endpoint                       | For LocalStack or a VPC endpoint.                                  |

Set `path`, `parameters` or both. Names from `parameters` win over the same name read from `path`. The aliases `ssm` and `parameter-store` work too.
