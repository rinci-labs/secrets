import { SecretsError } from "../errors.js"
import { assertSecureUrl, request, requestJson, trimSlash } from "../http.js"
import { defineProvider, flatten, options } from "./types.js"

/**
 * HashiCorp Vault or OpenBao, KV v1 or v2. Authenticates with VAULT_TOKEN, or
 * with AppRole, in which case the token it receives is revoked afterwards.
 */
export const vault = defineProvider({
  name: "vault",
  description: "HashiCorp Vault / OpenBao KV v1 or v2 via token or AppRole.",
  credentials: ["VAULT_TOKEN", "VAULT_ROLE_ID", "VAULT_SECRET_ID"],
  withhold: ["VAULT_TOKEN", "VAULT_ROLE_ID", "VAULT_SECRET_ID"],

  async load(raw, { env, fetch }) {
    const opt = options("vault", raw)
    const address = trimSlash(opt.required("address", env.VAULT_ADDR, "Set address in the source or VAULT_ADDR."))
    assertSecureUrl(address, { allowInsecure: opt.boolean("allowInsecure"), what: "vault address" })
    const mount = opt.string("mount") ?? "secret"
    const path = opt.required("path").replace(/^\/+|\/+$/g, "")
    const kvVersion = opt.number("kvVersion", 2)
    const namespace = opt.string("namespace") ?? env.VAULT_NAMESPACE
    const timeoutMs = opt.number("timeoutMs", 15_000)
    const base: Record<string, string> = namespace ? { "X-Vault-Namespace": namespace } : {}

    let token = env.VAULT_TOKEN
    let minted = false
    if (!token) {
      if (!env.VAULT_ROLE_ID || !env.VAULT_SECRET_ID) {
        throw new SecretsError("vault: no credentials", {
          hint: "Set VAULT_TOKEN, or VAULT_ROLE_ID and VAULT_SECRET_ID for AppRole.",
        })
      }
      const approle = opt.string("approleMount") ?? "approle"
      const login = await requestJson<{ auth: { client_token: string } }>(`${address}/v1/auth/${approle}/login`, {
        what: "Vault AppRole login",
        method: "POST",
        headers: { ...base, "Content-Type": "application/json" },
        body: JSON.stringify({ role_id: env.VAULT_ROLE_ID, secret_id: env.VAULT_SECRET_ID }),
        timeoutMs,
        fetch,
      })
      token = login.auth.client_token
      minted = true
    }

    try {
      const segments = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/")
      const url = `${address}/v1/${segments(mount)}/${kvVersion === 2 ? "data/" : ""}${segments(path)}`
      const body = await requestJson<{ data: Record<string, unknown> & { data?: Record<string, unknown> } }>(url, {
        what: `Vault read (${mount}/${path})`,
        headers: { ...base, "X-Vault-Token": token },
        timeoutMs,
        retries: 2,
        fetch,
      })
      return flatten((kvVersion === 2 ? body.data.data : body.data) ?? {})
    } finally {
      if (minted) {
        await request(`${address}/v1/auth/token/revoke-self`, {
          what: "Vault token revoke",
          method: "POST",
          headers: { ...base, "X-Vault-Token": token },
          timeoutMs: 5_000,
          fetch,
        }).catch(() => undefined)
      }
    }
  },
})
