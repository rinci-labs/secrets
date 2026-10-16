import { SecretsError } from "../errors.js"
import { execJson } from "./exec.js"
import { defineProvider, options, type Secrets } from "./types.js"

/** Bitwarden Secrets Manager, through the `bws` CLI and a machine account token. */
export const bitwarden = defineProvider({
  name: "bitwarden",
  description: "Bitwarden Secrets Manager via the bws CLI and a machine account token.",
  credentials: ["BWS_ACCESS_TOKEN"],
  withhold: ["BWS_ACCESS_TOKEN"],

  async load(raw, { env }) {
    const opt = options("bitwarden", raw)
    if (!env.BWS_ACCESS_TOKEN)
      throw new SecretsError("bitwarden: no credentials", { hint: "Set BWS_ACCESS_TOKEN to a machine account token." })
    const args = ["secret", "list"]
    const projectId = opt.argument("projectId")
    if (projectId) args.push(projectId)
    args.push("--output", "json")
    const serverUrl = opt.argument("serverUrl")
    if (serverUrl) args.push("--server-url", serverUrl)

    const list = await execJson<{ key: string; value: string }[]>(opt.string("cli") ?? "bws", args, {
      env,
      what: "Bitwarden read",
      install: "Install the Bitwarden Secrets Manager CLI: https://bitwarden.com/help/secrets-manager-cli/",
    })
    const out: Secrets = {}
    for (const secret of list) out[secret.key] = secret.value
    return out
  },
})
