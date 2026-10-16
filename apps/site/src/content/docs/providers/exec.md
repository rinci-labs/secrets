---
title: Any other manager
label: Any CLI (exec)
description: Any secrets manager with a CLI, run without a shell, its JSON or dotenv output read as a source. Pulumi ESC, Keeper, Akeyless, Conjur, Kubernetes and more.
group: Providers
order: 12
---

If a manager has a CLI that can print secrets, it works as a source. `exec` runs the command directly (no shell), reads its output and merges it like any other source.

```json
{
  "provider": "exec",
  "command": "esc",
  "args": ["env", "open", "myorg/myapp/${SECRETS_ENV:-dev}", "--format", "dotenv"],
  "withhold": ["PULUMI_ACCESS_TOKEN"]
}
```

Output starting with `{` is read as a JSON object. Anything else is read as a `.env` file. Set `format` to choose explicitly, or `key` to store the whole output under one name.

## Recipes

| Manager                | `command` and `args`                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Pulumi ESC             | `esc` `["env", "open", "org/project/env", "--format", "dotenv"]`                         |
| Keeper Secrets Manager | `ksm` `["secret", "get", "<record uid>", "--json"]`, with `format` set to `json`         |
| Akeyless               | `akeyless` `["get-secret-value", "--name", "/myapp/db-url"]`, with `key` set to the name |
| CyberArk Conjur        | `conjur` `["variable", "get", "-i", "myapp/db-url"]`, with `key` set to the name         |
| Kubernetes Secret      | a script that runs `kubectl get secret` and decodes `.data` to JSON                      |
| Your own               | `./scripts/secrets.sh`, printing `KEY=value` lines                                       |

Check the exact flags against your CLI's version: vendors change them. A recipe that prints nested JSON gives one variable per top-level key, with nested values as JSON text.

## Credentials and `withhold`

The CLI logs in the way it always does: a token in the environment, a session file or a desktop app. `exec` cannot know which variables are its credentials, so list them in `withhold` and they are removed from your command's environment like the built-in providers' credentials. `withhold` works on every source, not just `exec`.

## Options

| Option      | Default  |                                                                     |
| ----------- | -------- | ------------------------------------------------------------------- |
| `command`   | required | The program. Looked up on `PATH`, or a path relative to the config. |
| `args`      | `[]`     | Passed exactly as written. `${VAR}` interpolation works.            |
| `format`    | detected | `json`, `dotenv` or `raw`.                                          |
| `key`       |          | Store the whole output under this name.                             |
| `timeoutMs` | `30000`  | The command is stopped after this long.                             |
| `withhold`  |          | Credential variables to remove from your command.                   |

Output is capped at 16 MB. Error output is shown in errors, cleaned of control characters, so keep the CLI from printing secrets to stderr.

## Security

The config names the command, so treat it like a script in the repository: review changes to it. The tool already refuses configs that another user owns or that anyone can edit, and never reads a config from above the repository root.
