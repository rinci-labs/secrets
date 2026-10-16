---
title: Providers
label: Overview
description: Every supported secrets manager, how each one authenticates, and which credentials are withheld from your command.
group: Providers
order: 0
---

Each source in the config names a provider. HTTP providers talk to the vendor API directly with `fetch`. 1Password, Bitwarden and SOPS go through their official CLIs, because their auth flows live there. Anything else with a CLI works through [`exec`](/docs/providers/exec).

| Provider                                 | Reads                       | Auth                          | Withheld from the command                         |
| ---------------------------------------- | --------------------------- | ----------------------------- | ------------------------------------------------- |
| [`infisical`](/docs/providers/infisical) | one environment and path    | Universal Auth or token       | all `INFISICAL_*` credentials                     |
| [`doppler`](/docs/providers/doppler)     | one config                  | service token                 | `DOPPLER_TOKEN`                                   |
| [`vault`](/docs/providers/vault)         | one KV v1/v2 path           | token or AppRole              | `VAULT_TOKEN`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID` |
| [`aws`](/docs/providers/aws)             | one Secrets Manager secret  | `AWS_*` env vars              | none                                              |
| [`aws-ssm`](/docs/providers/aws-ssm)     | a parameter path or a list  | `AWS_*` env vars              | none                                              |
| [`gcp`](/docs/providers/gcp)             | one bundle secret or a list | ADC, service account or token | none                                              |
| [`azure`](/docs/providers/azure)         | a vault, or listed secrets  | service principal or token    | `AZURE_KEYVAULT_TOKEN`                            |
| [`1password`](/docs/providers/1password) | one item's fields           | `op` CLI                      | `OP_SERVICE_ACCOUNT_TOKEN`                        |
| [`bitwarden`](/docs/providers/bitwarden) | a project's secrets         | `bws` CLI                     | `BWS_ACCESS_TOKEN`                                |
| [`sops`](/docs/providers/sops)           | one encrypted file          | `sops` CLI and your keys      | `SOPS_AGE_KEY`, `SOPS_AGE_KEY_FILE`               |
| [`dotenv`](/docs/providers/dotenv)       | local files                 | none                          | none                                              |
| [`exec`](/docs/providers/exec)           | any command's output        | the CLI's own                 | whatever you list in `withhold`                   |

Aliases are accepted too: `openbao` and `hashicorp` for `vault`, `ssm` and `parameter-store` for `aws-ssm`, `op` and `onepassword` for `1password`, `bws` for `bitwarden`, `env` for `dotenv`, and `command` for `exec`.

Every source also takes `name`, `optional` and `withhold`. See [configuration](/docs/configuration).

## One stored value, many variables

AWS and GCP store a secret as a single blob. The `format` option decides how a blob becomes variables:

| `format`         | Behaviour                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `auto` (default) | A JSON object becomes one variable per key. Anything else needs `key`, and is stored whole under that name. |
| `json`           | Must be a JSON object.                                                                                      |
| `dotenv`         | Parsed as a `.env` file.                                                                                    |
| `raw`            | Stored whole under `key`.                                                                                   |

Non-string JSON values are converted: numbers and booleans become strings, and nested objects become JSON text.

## Missing something?

A provider is an object with a `load` function. See [custom providers](/docs/library#custom-providers) to add one in code, or open an issue.
