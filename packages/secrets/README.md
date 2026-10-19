# @rinci/secrets

One entry point for every secrets manager. Fetch from Infisical, Doppler, Vault, AWS Secrets Manager and Parameter Store, Google Cloud, Azure, 1Password, Bitwarden, SOPS files, `.env` files or any other manager with a CLI, then run any command with the values in its environment.

- **One config, many sources**: read in parallel, merged in order, later sources win.
- **Safe by default**: no credentials in the config, provider credentials withheld from your app, fails closed, no shell, HTTPS enforced for public hosts, minted tokens revoked.
- **Transparent**: every run reports sources, counts, timings and overridden variables. Never values.
- **Zero dependencies**: SigV4, the Google JWT exchange and the Windows argument escaping are in the source, with tests.
- **Bun and Node 20.10+**, on Windows, macOS and Linux.

## Quick start

```sh
bun add -d @rinci/secrets
bunx rinci-secrets init infisical      # writes secrets.config.json
echo "INFISICAL_CLIENT_ID=..." >> .env.infisical
echo "INFISICAL_CLIENT_SECRET=..." >> .env.infisical
bunx rinci-secrets run -e prod -- bun start
```

```json
{
  "$schema": "https://secrets.rin.ci/schema.json",
  "envFiles": [".env.infisical"],
  "sources": [
    {
      "provider": "infisical",
      "projectId": "your-project-id",
      "environment": "${SECRETS_ENV:-dev}"
    }
  ]
}
```

## Commands

The CLI installs as `rinci-secrets` and, shorter, `rsec`.

| Command                                             |                                                           |
| --------------------------------------------------- | --------------------------------------------------------- |
| `run [opts] [--] <cmd...>`                          | Run a command with secrets injected.                      |
| `list [--json]`                                     | The keys each source provides, and which wins. No values. |
| `check`                                             | Log in to every source and report. No values.             |
| `export [--format dotenv\|json\|shell\|powershell]` | Print secrets. Refuses to write to a terminal.            |
| `init [provider]`                                   | Write a starter config.                                   |
| `providers`                                         | Supported providers and their credentials.                |

## Library

```ts
import { loadSecrets, runWithSecrets } from "@rinci/secrets"

const { secrets } = await loadSecrets({ environment: "prod" })
const { code } = await runWithSecrets("bun", ["dev"])
```

## Docs

[secrets.rin.ci/docs](https://secrets.rin.ci/docs): configuration, every provider, the CLI, the library API and the security model.

For agents and LLMs: [llms.txt](https://secrets.rin.ci/llms.txt) (index), [llms-full.txt](https://secrets.rin.ci/llms-full.txt) (all docs), and Markdown twins such as [docs/cli.md](https://secrets.rin.ci/docs/cli.md).

## License

MIT
