---
title: Azure Key Vault
label: Azure
description: Every enabled secret in an Azure Key Vault, or a chosen list, through a service principal or an access token. Dashes become underscores.
group: Providers
order: 7
---

```json
{ "provider": "azure", "vault": "my-vault" }
```

## Credentials

| Variable                                                    |                                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | A service principal with _Key Vault Secrets User_.                                                          |
| `AZURE_KEYVAULT_TOKEN`                                      | A ready token: `az account get-access-token --resource https://vault.azure.net --query accessToken -o tsv`. |

Only `AZURE_KEYVAULT_TOKEN` is withheld from the command. The service principal variables are standard, and apps may use them.

## Options

| Option          | Default                                                  |                                                              |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `vault`         | required                                                 | Vault name, or its full `https://` URL for sovereign clouds. |
| `secrets`       | all enabled                                              | A list or map of `ENV_NAME: secret-name`.                    |
| `authorityHost` | `AZURE_AUTHORITY_HOST`, then `login.microsoftonline.com` | For sovereign clouds.                                        |

Key Vault names cannot contain underscores, so when reading the whole vault, `DATABASE-URL` becomes `DATABASE_URL`. Use a map for any other naming. Disabled and certificate-backed secrets are skipped, and values are read eight at a time.
