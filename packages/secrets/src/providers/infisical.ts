import { SecretsError } from "../errors.js"
import { assertSecureUrl, request, requestJson, trimSlash } from "../http.js"
import { defineProvider, options } from "./types.js"

interface InfisicalSecret {
  secretKey: string
  secretValue: string
}

interface SecretsResponse {
  secrets: InfisicalSecret[]
  imports?: { secrets: InfisicalSecret[] }[]
}

/**
 * Infisical, cloud or self-hosted. Logs in with a Universal Auth machine
 * identity (or takes a ready token), reads one environment and path, and
 * revokes the access token it minted once the read is done.
 */
export const infisical = defineProvider({
  name: "infisical",
  description: "Infisical (cloud or self-hosted) via a Universal Auth machine identity or token.",
  credentials: [
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET",
    "INFISICAL_TOKEN",
  ],
  withhold: [
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET",
    "INFISICAL_TOKEN",
  ],

  async load(raw, { env, fetch }) {
    const opt = options("infisical", raw)
    const domain = trimSlash(opt.string("domain") ?? env.INFISICAL_DOMAIN ?? "https://app.infisical.com").replace(
      /\/api$/,
      "",
    )
    assertSecureUrl(domain, { allowInsecure: opt.boolean("allowInsecure"), what: "infisical domain" })
    const projectId = opt.required(
      "projectId",
      env.INFISICAL_PROJECT_ID,
      "Set projectId in the source or INFISICAL_PROJECT_ID.",
    )
    const environment = opt.required("environment", undefined, 'For example "environment": "${SECRETS_ENV:-dev}".')
    const secretPath = opt.string("path") ?? "/"
    const recursive = opt.boolean("recursive")
    const timeoutMs = opt.number("timeoutMs", 15_000)

    let accessToken = env.INFISICAL_TOKEN
    let minted = false
    if (!accessToken) {
      const clientId = env.INFISICAL_CLIENT_ID ?? env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID
      const clientSecret = env.INFISICAL_CLIENT_SECRET ?? env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        throw new SecretsError("infisical: no credentials", {
          hint: "Set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET (a machine identity), or INFISICAL_TOKEN.",
        })
      }
      const login = await requestJson<{ accessToken: string }>(`${domain}/api/v1/auth/universal-auth/login`, {
        what: "Infisical login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
        timeoutMs,
        fetch,
      })
      accessToken = login.accessToken
      minted = true
    }

    try {
      const query = new URLSearchParams({
        projectId,
        environment,
        secretPath,
        recursive: String(recursive),
        include_imports: "true",
        expandSecretReferences: "true",
        viewSecretValue: "true",
      })
      const body = await requestJson<SecretsResponse>(`${domain}/api/v4/secrets?${query}`, {
        what: `Infisical read (${environment}${secretPath})`,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs,
        retries: 2,
        fetch,
      })
      const out: Record<string, string> = {}
      // Imported secrets first, so the folder's own values win on a clash.
      for (const imported of body.imports ?? []) {
        for (const secret of imported.secrets) out[secret.secretKey] = secret.secretValue
      }
      for (const secret of body.secrets) out[secret.secretKey] = secret.secretValue
      return out
    } finally {
      if (minted) {
        await request(`${domain}/api/v1/auth/token/revoke`, {
          what: "Infisical token revoke",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
          timeoutMs: 5_000,
          fetch,
        }).catch(() => undefined)
      }
    }
  },
})
