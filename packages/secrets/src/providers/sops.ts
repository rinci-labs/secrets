import { resolve } from "node:path"
import { SecretsError } from "../errors.js"
import { execJson } from "./exec.js"
import { defineProvider, flatten, options } from "./types.js"

/**
 * SOPS-encrypted files (age, PGP, AWS/GCP/Azure KMS, Vault transit), decrypted
 * in memory by the sops CLI. The file is committed; only the key is secret.
 */
export const sops = defineProvider({
  name: "sops",
  description: "SOPS-encrypted .env, JSON or YAML files, decrypted in memory by the sops CLI.",
  credentials: ["SOPS_AGE_KEY", "SOPS_AGE_KEY_FILE"],
  withhold: ["SOPS_AGE_KEY", "SOPS_AGE_KEY_FILE"],

  async load(raw, { env, cwd }) {
    const opt = options("sops", raw)
    const file = opt.argument("file")
    if (!file)
      throw new SecretsError('sops: "file" is required', { hint: 'e.g. "file": "secrets.${SECRETS_ENV:-dev}.env"' })
    const args = ["--decrypt", "--output-type", "json"]
    const inputType = opt.argument("inputType")
    if (inputType) args.push("--input-type", inputType)
    args.push(resolve(cwd, file))

    const decrypted = await execJson<unknown>(opt.string("cli") ?? "sops", args, {
      env,
      what: `sops decrypt (${file})`,
      install: "Install sops: https://getsops.io/docs/#download",
      timeoutMs: opt.number("timeoutMs", 30_000),
    })
    if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) {
      throw new SecretsError(`sops: ${file} does not hold a map of names to values`)
    }
    return flatten(decrypted as Record<string, unknown>)
  },
})
