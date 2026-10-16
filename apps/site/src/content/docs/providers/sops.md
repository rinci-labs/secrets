---
title: SOPS
description: Encrypted .env, JSON or YAML files committed next to the code, decrypted in memory by the sops CLI with age, PGP or a cloud KMS.
group: Providers
order: 10
---

```json
{ "provider": "sops", "file": "secrets.${SECRETS_ENV:-dev}.env" }
```

The encrypted file lives in the repository. Only the key that decrypts it is secret. The tool runs `sops --decrypt --output-type json` on the file, reads the result from memory, and never writes the plaintext to disk.

## Setup

Encrypt a file once, with an [age](https://github.com/FiloSottile/age) key in this example:

```sh
age-keygen -o ~/.config/sops/age/keys.txt
sops encrypt --age <public key> -i secrets.dev.env
```

A `.sops.yaml` in the repository can name the keys for each file pattern, so teammates and CI can decrypt with their own keys.

## Credentials

Whatever your sops keys need: `SOPS_AGE_KEY` or `SOPS_AGE_KEY_FILE` for age (or the default key file), a GPG agent for PGP, or AWS, GCP or Azure credentials for a cloud KMS. `SOPS_AGE_KEY` and `SOPS_AGE_KEY_FILE` are withheld from the command. Cloud credentials stay, as with the cloud providers.

## Options

| Option      | Default        |                                                                             |
| ----------- | -------------- | --------------------------------------------------------------------------- |
| `file`      | required       | Path to the encrypted file, relative to the config.                         |
| `inputType` | from extension | `dotenv`, `json`, `yaml`, `ini` or `binary`, when the extension is unusual. |
| `cli`       | `sops`         | Path to the sops binary.                                                    |

Nested JSON and YAML values become JSON text under their top-level key. Keep files flat for one variable per value.
