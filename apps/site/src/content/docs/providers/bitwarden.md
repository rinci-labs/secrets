---
title: Bitwarden Secrets Manager
label: Bitwarden
description: All secrets a Bitwarden machine account can see, or one project's, through the bws CLI. Self-hosted servers supported.
group: Providers
order: 9
---

```json
{ "provider": "bitwarden", "projectId": "your-project-id" }
```

## Credentials

The [`bws` CLI](https://bitwarden.com/help/secrets-manager-cli/) must be installed, with `BWS_ACCESS_TOKEN` set to a machine account access token. The token is withheld from the command.

## Options

| Option      | Default         |                                |
| ----------- | --------------- | ------------------------------ |
| `projectId` | all accessible  | Limit to one project.          |
| `serverUrl` | Bitwarden Cloud | For self-hosted or EU servers. |
| `cli`       | `bws`           | Path to the CLI.               |

Each secret's key becomes the variable name.
