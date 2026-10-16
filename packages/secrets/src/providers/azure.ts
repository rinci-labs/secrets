import { SecretsError } from "../errors.js"
import { assertSecureUrl, mapLimit, requestJson, trimSlash } from "../http.js"
import { defineProvider, type Env, options, type Secrets } from "./types.js"

const API_VERSION = "7.4"

async function accessToken(env: Env, authorityHost: string, doFetch: typeof fetch): Promise<string> {
  if (env.AZURE_KEYVAULT_TOKEN) return env.AZURE_KEYVAULT_TOKEN
  const { AZURE_TENANT_ID: tenant, AZURE_CLIENT_ID: clientId, AZURE_CLIENT_SECRET: clientSecret } = env
  if (!tenant || !clientId || !clientSecret) {
    throw new SecretsError("azure: no credentials", {
      hint: "Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, or AZURE_KEYVAULT_TOKEN (`az account get-access-token --resource https://vault.azure.net`).",
    })
  }
  const token = await requestJson<{ access_token: string }>(
    `${authorityHost}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      what: "Azure token exchange",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://vault.azure.net/.default",
      }).toString(),
      fetch: doFetch,
    },
  )
  return token.access_token
}

/**
 * Azure Key Vault. Reads the listed `secrets`, or every enabled secret in the
 * vault. Key Vault names cannot contain underscores, so `DATABASE-URL` becomes
 * `DATABASE_URL` unless a mapping names it explicitly.
 */
export const azure = defineProvider({
  name: "azure",
  description: "Azure Key Vault via a service principal or an access token.",
  credentials: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_KEYVAULT_TOKEN"],
  withhold: ["AZURE_KEYVAULT_TOKEN"],

  async load(raw, { env, fetch }) {
    const opt = options("azure", raw)
    const name = opt.required("vault", undefined, 'Set "vault" to the vault name or its https URL.')
    // A bare name is spliced into a hostname, so it must be a name and nothing else.
    if (!name.startsWith("https://") && !/^[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]$/.test(name)) {
      throw new SecretsError(`azure: "${name}" is not a valid vault name`, {
        hint: "Use 3-24 letters, digits and dashes, or the vault's full https:// URL.",
      })
    }
    const vaultUrl = trimSlash(name.startsWith("https://") ? name : `https://${name}.vault.azure.net`)
    const parsed = assertSecureUrl(vaultUrl, { what: "azure vault" })
    if (parsed.pathname !== "/" || parsed.search || parsed.username) {
      throw new SecretsError(`azure: vault URL must be just the origin, got ${vaultUrl}`)
    }
    const authority = trimSlash(
      opt.string("authorityHost") ?? env.AZURE_AUTHORITY_HOST ?? "https://login.microsoftonline.com",
    )
    const timeoutMs = opt.number("timeoutMs", 15_000)
    const token = await accessToken(env, authority, fetch)
    const headers = { Authorization: `Bearer ${token}` }

    let mapping = opt.mapping("secrets")
    if (!mapping) {
      mapping = {}
      let next: string | undefined = `${vaultUrl}/secrets?api-version=${API_VERSION}&maxresults=25`
      while (next) {
        // Only follow pagination links back into the same vault.
        if (!next.startsWith(`${vaultUrl}/`)) throw new SecretsError(`azure: unexpected nextLink ${next}`)
        const page: {
          value: { id: string; managed?: boolean; attributes?: { enabled?: boolean } }[]
          nextLink?: string | null
        } = await requestJson(next, { what: "Azure Key Vault list", headers, timeoutMs, retries: 2, fetch })
        for (const item of page.value) {
          if (item.managed || item.attributes?.enabled === false) continue
          const secretName = item.id.split("/").pop() as string
          mapping[secretName.replaceAll("-", "_")] = secretName
        }
        next = page.nextLink ?? undefined
      }
    }

    const entries = Object.entries(mapping)
    const values = await mapLimit(entries, 8, ([, secretName]) =>
      requestJson<{ value: string }>(
        `${vaultUrl}/secrets/${encodeURIComponent(secretName)}?api-version=${API_VERSION}`,
        {
          what: `Azure Key Vault read (${secretName})`,
          headers,
          timeoutMs,
          retries: 2,
          fetch,
        },
      ),
    )
    const out: Secrets = {}
    entries.forEach(([envName], i) => {
      out[envName] = (values[i] as { value: string }).value
    })
    return out
  },
})
