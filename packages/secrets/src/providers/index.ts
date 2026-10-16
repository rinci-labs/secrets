import { SecretsError } from "../errors.js"
import { aws } from "./aws.js"
import { azure } from "./azure.js"
import { bitwarden } from "./bitwarden.js"
import { command } from "./command.js"
import { doppler } from "./doppler.js"
import { dotenv } from "./dotenv.js"
import { gcp } from "./gcp.js"
import { infisical } from "./infisical.js"
import { onepassword } from "./onepassword.js"
import { sops } from "./sops.js"
import { ssm } from "./ssm.js"
import type { Provider } from "./types.js"
import { vault } from "./vault.js"

const registry = new Map<string, Provider>(
  [infisical, doppler, vault, aws, ssm, gcp, azure, onepassword, bitwarden, sops, dotenv, command].map((p) => [
    p.name,
    p,
  ]),
)

const ALIASES: Record<string, string> = {
  onepassword: "1password",
  op: "1password",
  bws: "bitwarden",
  hashicorp: "vault",
  openbao: "vault",
  "aws-secrets-manager": "aws",
  ssm: "aws-ssm",
  "parameter-store": "aws-ssm",
  "gcp-secret-manager": "gcp",
  "azure-key-vault": "azure",
  env: "dotenv",
  command: "exec",
}

/** Adds a provider, or replaces a built-in one of the same name. */
export function registerProvider(provider: Provider): void {
  registry.set(provider.name, provider)
}

export function getProvider(name: string): Provider {
  const provider = registry.get(Object.hasOwn(ALIASES, name) ? (ALIASES[name] as string) : name)
  if (!provider) {
    throw new SecretsError(`Unknown provider "${name}"`, { hint: `Available: ${[...registry.keys()].join(", ")}.` })
  }
  return provider
}

export function listProviders(): Provider[] {
  return [...registry.values()]
}

export { aws, azure, bitwarden, command, doppler, dotenv, gcp, infisical, onepassword, sops, ssm, vault }
export { signAwsRequest } from "./aws.js"
export * from "./types.js"
