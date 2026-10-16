import { createSign } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { SecretsError } from "../errors.js"
import { assertSecureUrl, mapLimit, requestJson } from "../http.js"
import { decodeBase64, defineProvider, type Env, options, parsePayload, type Secrets } from "./types.js"

const SCOPE = "https://www.googleapis.com/auth/cloud-platform"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

type CredentialsFile =
  | { type: "service_account"; client_email: string; private_key: string; token_uri?: string }
  | { type: "authorized_user"; client_id: string; client_secret: string; refresh_token: string }

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url")

function adcPath(env: Env): string {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return env.GOOGLE_APPLICATION_CREDENTIALS
  const configDir =
    process.platform === "win32" ? join(env.APPDATA ?? homedir(), "gcloud") : join(homedir(), ".config", "gcloud")
  return join(configDir, "application_default_credentials.json")
}

/** An OAuth access token from GOOGLE_OAUTH_ACCESS_TOKEN or Application Default Credentials. */
async function accessToken(env: Env, doFetch: typeof fetch): Promise<string> {
  if (env.GOOGLE_OAUTH_ACCESS_TOKEN) return env.GOOGLE_OAUTH_ACCESS_TOKEN

  const path = adcPath(env)
  let creds: CredentialsFile
  try {
    creds = JSON.parse(await readFile(path, "utf8")) as CredentialsFile
  } catch (error) {
    throw new SecretsError("gcp: no credentials", {
      hint: "Set GOOGLE_APPLICATION_CREDENTIALS to a service account key, run `gcloud auth application-default login`, or set GOOGLE_OAUTH_ACCESS_TOKEN.",
      cause: error,
    })
  }

  let form: URLSearchParams
  let tokenUrl = TOKEN_URL
  if (creds.type === "service_account") {
    tokenUrl = assertSecureUrl(creds.token_uri ?? TOKEN_URL, { what: "gcp token_uri" }).href
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
      JSON.stringify({ iss: creds.client_email, scope: SCOPE, aud: tokenUrl, iat: now, exp: now + 600 }),
    )}`
    const signature = createSign("RSA-SHA256").update(unsigned).sign(creds.private_key)
    form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    })
  } else if (creds.type === "authorized_user") {
    form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
    })
  } else {
    throw new SecretsError(`gcp: unsupported credentials type "${(creds as { type: string }).type}" in ${path}`)
  }

  const token = await requestJson<{ access_token: string }>(tokenUrl, {
    what: "Google token exchange",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    fetch: doFetch,
  })
  return token.access_token
}

/**
 * Google Cloud Secret Manager. Either `secret` (one secret holding JSON or
 * dotenv, expanded into many vars) or `secrets` (one var per secret).
 */
export const gcp = defineProvider({
  name: "gcp",
  description: "Google Cloud Secret Manager via ADC, a service account key or an access token.",
  credentials: ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_OAUTH_ACCESS_TOKEN"],
  withhold: [],

  async load(raw, { env, fetch }) {
    const opt = options("gcp", raw)
    const project = opt.required(
      "project",
      env.GOOGLE_CLOUD_PROJECT,
      "Set project in the source or GOOGLE_CLOUD_PROJECT.",
    )
    const bundle = opt.string("secret")
    const mapping = opt.mapping("secrets")
    if (!bundle && !mapping)
      throw new SecretsError('gcp: set "secret" (one JSON/dotenv secret) or "secrets" (a list or map)')
    const timeoutMs = opt.number("timeoutMs", 15_000)
    const token = await accessToken(env, fetch)

    const access = async (ref: string): Promise<string> => {
      const [name, version = "latest"] = ref.split("@")
      const url = `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(project)}/secrets/${encodeURIComponent(name ?? "")}/versions/${encodeURIComponent(version)}:access`
      const body = await requestJson<{ payload: { data: string } }>(url, {
        what: `GCP Secret Manager read (${ref})`,
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs,
        retries: 2,
        fetch,
      })
      return decodeBase64(body.payload.data)
    }

    const out: Secrets = {}
    if (bundle) {
      Object.assign(
        out,
        parsePayload(await access(bundle), {
          format: opt.string("format"),
          key: opt.string("key"),
          label: `gcp secret ${bundle}`,
        }),
      )
    }
    if (mapping) {
      const entries = Object.entries(mapping)
      const values = await mapLimit(entries, 8, ([, ref]) => access(ref))
      entries.forEach(([envName], i) => {
        out[envName] = values[i] as string
      })
    }
    return out
  },
})
