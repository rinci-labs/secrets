---
title: 1Password
description: Fields of a 1Password item through the op CLI, with a service account token or the desktop app. Labels become variable names.
group: Providers
order: 8
---

```json
{ "provider": "1password", "vault": "Engineering", "item": "myapp-${SECRETS_ENV:-dev}" }
```

## Credentials

The [`op` CLI](https://developer.1password.com/docs/cli/get-started/) must be installed. It authenticates with `OP_SERVICE_ACCOUNT_TOKEN` (withheld from the command), or through desktop app integration when you are signed in.

## Fields

Every field whose label is a valid variable name, such as `DATABASE_URL`, becomes a variable. Other fields are skipped, and listed with `-v`. To pick or rename fields, map them:

```json
{ "provider": "1password", "item": "Stripe", "fields": { "STRIPE_KEY": "secret key" } }
```

With `fields`, a missing label is an error.

## Options

| Option    | Default          |                                     |
| --------- | ---------------- | ----------------------------------- |
| `item`    | required         | Item name or ID.                    |
| `vault`   |                  | Vault name or ID.                   |
| `account` |                  | For multiple signed-in accounts.    |
| `fields`  | all valid labels | A list or map of `ENV_NAME: label`. |
| `cli`     | `op`             | Path to the CLI.                    |
