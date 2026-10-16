import type { SecretsConfig } from "./config.js"

const SCHEMA = "https://secrets.rin.ci/schema.json"

/** Starter configs for `rinci-secrets init <provider>`. Placeholders only; credentials never go here. */
export const TEMPLATES: Record<string, { config: SecretsConfig; next: string }> = {
  infisical: {
    config: {
      $schema: SCHEMA,
      envFiles: [".env.infisical"],
      sources: [
        {
          provider: "infisical",
          domain: "https://app.infisical.com",
          projectId: "your-project-id",
          environment: "${SECRETS_ENV:-dev}",
          path: "/",
        },
      ],
    },
    next: "put INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET in .env.infisical, then set projectId",
  },
  doppler: {
    config: { $schema: SCHEMA, envFiles: [".env.doppler"], sources: [{ provider: "doppler" }] },
    next: "put DOPPLER_TOKEN (a service token) in .env.doppler",
  },
  vault: {
    config: {
      $schema: SCHEMA,
      envFiles: [".env.vault"],
      sources: [
        { provider: "vault", address: "https://vault.example.com", mount: "secret", path: "myapp/${SECRETS_ENV:-dev}" },
      ],
    },
    next: "put VAULT_TOKEN (or VAULT_ROLE_ID and VAULT_SECRET_ID) in .env.vault, then set address and path",
  },
  aws: {
    config: {
      $schema: SCHEMA,
      sources: [{ provider: "aws", region: "us-east-1", secretId: "myapp/${SECRETS_ENV:-dev}" }],
    },
    next: "export AWS credentials (e.g. `aws configure export-credentials --format env`), then set secretId",
  },
  "aws-ssm": {
    config: {
      $schema: SCHEMA,
      sources: [{ provider: "aws-ssm", region: "us-east-1", path: "/myapp/${SECRETS_ENV:-dev}" }],
    },
    next: "export AWS credentials (e.g. `aws configure export-credentials --format env`), then set path",
  },
  gcp: {
    config: {
      $schema: SCHEMA,
      sources: [{ provider: "gcp", project: "my-project", secret: "myapp-${SECRETS_ENV:-dev}" }],
    },
    next: "run `gcloud auth application-default login`, then set project and secret",
  },
  azure: {
    config: { $schema: SCHEMA, envFiles: [".env.azure"], sources: [{ provider: "azure", vault: "my-vault" }] },
    next: "put AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.azure, then set vault",
  },
  "1password": {
    config: {
      $schema: SCHEMA,
      sources: [{ provider: "1password", vault: "Engineering", item: "myapp-${SECRETS_ENV:-dev}" }],
    },
    next: "sign in to the op CLI or set OP_SERVICE_ACCOUNT_TOKEN, then set vault and item",
  },
  bitwarden: {
    config: {
      $schema: SCHEMA,
      envFiles: [".env.bitwarden"],
      sources: [{ provider: "bitwarden", projectId: "your-project-id" }],
    },
    next: "put BWS_ACCESS_TOKEN in .env.bitwarden, then set projectId",
  },
  sops: {
    config: { $schema: SCHEMA, sources: [{ provider: "sops", file: "secrets.${SECRETS_ENV:-dev}.env" }] },
    next: "encrypt the file with `sops encrypt -i secrets.dev.env`, and make the key available (e.g. SOPS_AGE_KEY_FILE)",
  },
  dotenv: {
    config: { $schema: SCHEMA, sources: [{ provider: "dotenv", path: [".env", ".env.local"], required: false }] },
    next: "add your values to .env and .env.local",
  },
  exec: {
    config: {
      $schema: SCHEMA,
      sources: [
        {
          provider: "exec",
          command: "esc",
          args: ["env", "open", "myorg/myapp/${SECRETS_ENV:-dev}", "--format", "dotenv"],
          withhold: ["PULUMI_ACCESS_TOKEN"],
        },
      ],
    },
    next: "point command and args at any CLI that prints JSON or dotenv (this example is Pulumi ESC)",
  },
}
