---
title: AWS Secrets Manager
label: AWS
description: One AWS Secrets Manager secret, JSON or plain text, signed with SigV4 from the standard AWS credential variables. No SDK.
group: Providers
order: 4
---

```json
{ "provider": "aws", "region": "eu-west-1", "secretId": "myapp/${SECRETS_ENV:-dev}" }
```

## Credentials

`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for temporary credentials, `AWS_SESSION_TOKEN`. These stay in the command's environment, because apps often use them directly.

Profiles, SSO and instance roles are not read directly. To keep the dependency count at zero, export them first:

```sh
eval "$(aws configure export-credentials --profile dev --format env)"
rinci-secrets run -- bun dev
```

Or run through `aws-vault exec dev -- rinci-secrets run -- bun dev`.

## Options

| Option         | Default                                 |                                                                                   |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `secretId`     | required                                | Name or ARN.                                                                      |
| `region`       | `AWS_REGION`, then `AWS_DEFAULT_REGION` |                                                                                   |
| `versionStage` | `AWSCURRENT`                            | For example `AWSPREVIOUS`.                                                        |
| `format`       | `auto`                                  | See [one value, many variables](/docs/providers#one-stored-value-many-variables). |
| `key`          |                                         | The variable name for a plain-text secret.                                        |
| `endpoint`     | regional endpoint                       | For LocalStack or a VPC endpoint.                                                 |

To read several secrets, add several `aws` sources, each with its own `name`.
