import { SecretsError } from "../errors.js"
import { execJson } from "./exec.js"
import { defineProvider, options, type Secrets } from "./types.js"

interface OpField {
  label?: string
  value?: string
  purpose?: string
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 1Password, through the `op` CLI (service account token or desktop app
 * integration). Fields whose label is a valid env name become vars; `fields`
 * maps other labels explicitly.
 */
export const onepassword = defineProvider({
  name: "1password",
  description: "1Password items via the op CLI (service account or desktop app).",
  credentials: ["OP_SERVICE_ACCOUNT_TOKEN"],
  withhold: ["OP_SERVICE_ACCOUNT_TOKEN"],

  async load(raw, { env, log }) {
    const opt = options("1password", raw)
    const item = opt.argument("item")
    if (!item) throw new SecretsError('1password: "item" is required', { hint: 'Set "item" to the item name or ID.' })
    const args = ["item", "get", item, "--format", "json", "--reveal"]
    const vault = opt.argument("vault")
    if (vault) args.push("--vault", vault)
    const account = opt.argument("account")
    if (account) args.push("--account", account)

    const result = await execJson<{ fields?: OpField[] }>(opt.string("cli") ?? "op", args, {
      env,
      what: `1Password read (${item})`,
      install: "Install the 1Password CLI: https://developer.1password.com/docs/cli/get-started/",
    })
    const byLabel = new Map(
      (result.fields ?? []).filter((f) => f.label && f.value !== undefined).map((f) => [f.label as string, f]),
    )

    const mapping = opt.mapping("fields")
    const out: Secrets = {}
    if (mapping) {
      for (const [envName, label] of Object.entries(mapping)) {
        const field = byLabel.get(label)
        if (!field) throw new SecretsError(`1password: item "${item}" has no field "${label}"`)
        out[envName] = field.value as string
      }
      return out
    }
    for (const [label, field] of byLabel) {
      if (field.purpose === "NOTES" || !field.value) continue
      if (ENV_NAME.test(label)) out[label] = field.value
      else log.debug(`1password: skipped field "${label}" (not an env name; map it with "fields")`)
    }
    return out
  },
})
