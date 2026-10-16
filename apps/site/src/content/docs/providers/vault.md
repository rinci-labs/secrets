---
title: HashiCorp Vault
label: Vault / OpenBao
description: Vault or OpenBao KV v1 and v2, with a token or AppRole login. Namespaces supported, AppRole tokens revoked after the read.
group: Providers
order: 3
---

```json
{
  "provider": "vault",
  "address": "https://vault.example.com",
  "mount": "secret",
  "path": "myapp/${SECRETS_ENV:-dev}"
}
```

## Credentials

| Variable                           |                                                               |
| ---------------------------------- | ------------------------------------------------------------- |
| `VAULT_TOKEN`                      | Used as-is.                                                   |
| `VAULT_ROLE_ID`, `VAULT_SECRET_ID` | AppRole login. The resulting token is revoked after the read. |

## Options

| Option         | Default           |                              |
| -------------- | ----------------- | ---------------------------- |
| `path`         | required          | Secret path under the mount. |
| `address`      | `VAULT_ADDR`      | Vault base URL.              |
| `mount`        | `secret`          | KV mount.                    |
| `kvVersion`    | `2`               | `1` or `2`.                  |
| `namespace`    | `VAULT_NAMESPACE` | Enterprise or HCP namespace. |
| `approleMount` | `approle`         | Where AppRole is mounted.    |

Each key in the secret becomes a variable. Non-string values are converted to JSON text.
