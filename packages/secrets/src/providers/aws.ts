import { createHash, createHmac } from "node:crypto"
import { SecretsError } from "../errors.js"
import { assertSecureUrl, requestJson } from "../http.js"
import { decodeBase64, defineProvider, options, parsePayload } from "./types.js"

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string | undefined
}

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex")
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data, "utf8").digest()

/**
 * AWS Signature Version 4 for a JSON POST. Small enough to read in one sitting,
 * which is the point: no SDK sits between the credentials and the request.
 */
export function signAwsRequest(input: {
  url: URL
  region: string
  service: string
  body: string
  headers: Record<string, string>
  credentials: AwsCredentials
  now?: Date
}): Record<string, string> {
  const { url, region, service, body, credentials } = input
  const amzDate = (input.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "")
  const date = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: url.host,
    "x-amz-date": amzDate,
  }
  if (credentials.sessionToken) headers["x-amz-security-token"] = credentials.sessionToken

  const names = Object.keys(headers).toSorted()
  const signedHeaders = names.join(";")
  const canonicalRequest = [
    "POST",
    url.pathname || "/",
    url.searchParams.toString(),
    names.map((name) => `${name}:${headers[name]}\n`).join(""),
    signedHeaders,
    sha256(body),
  ].join("\n")
  const scope = `${date}/${region}/${service}/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n")
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, date), region), service), "aws4_request")
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex")

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

/**
 * AWS Secrets Manager. Credentials come from the standard env vars only (use
 * `aws configure export-credentials --format env` or aws-vault for SSO and
 * profiles). They are not withheld from the child, since apps often use them.
 */
export const aws = defineProvider({
  name: "aws",
  description: "AWS Secrets Manager via the standard AWS_* credential env vars.",
  credentials: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"],
  withhold: [],

  async load(raw, { env, fetch }) {
    const opt = options("aws", raw)
    const region = opt.required(
      "region",
      env.AWS_REGION ?? env.AWS_DEFAULT_REGION,
      "Set region in the source or AWS_REGION.",
    )
    const secretId = opt.required("secretId")
    const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = env
    if (!accessKeyId || !secretAccessKey) {
      throw new SecretsError("aws: no credentials", {
        hint: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, e.g. via `aws configure export-credentials --format env`.",
      })
    }
    const url = assertSecureUrl(opt.string("endpoint") ?? `https://secretsmanager.${region}.amazonaws.com/`, {
      allowInsecure: opt.boolean("allowInsecure"),
      what: "aws endpoint",
    })

    const payload: Record<string, string> = { SecretId: secretId }
    const versionStage = opt.string("versionStage")
    if (versionStage) payload.VersionStage = versionStage
    const body = JSON.stringify(payload)
    const headers = signAwsRequest({
      url,
      region,
      service: "secretsmanager",
      body,
      headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "secretsmanager.GetSecretValue" },
      credentials: { accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN },
    })

    const result = await requestJson<{ SecretString?: string; SecretBinary?: string }>(url, {
      what: `AWS Secrets Manager read (${secretId})`,
      method: "POST",
      headers,
      body,
      timeoutMs: opt.number("timeoutMs", 15_000),
      retries: 2,
      fetch,
    })
    const text = result.SecretString ?? (result.SecretBinary ? decodeBase64(result.SecretBinary) : "")
    return parsePayload(text, { format: opt.string("format"), key: opt.string("key"), label: `aws secret ${secretId}` })
  },
})
