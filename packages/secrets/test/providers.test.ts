import { afterAll, describe, expect, test } from "bun:test"
import { createVerify, generateKeyPairSync } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SourceConfig } from "../src/config.js"
import { loadSecrets } from "../src/load.js"
import { silentLogger } from "../src/log.js"
import { signAwsRequest } from "../src/providers/aws.js"
import { fakeCli, mockFetch, tempDir } from "./helpers.js"

const tmp = tempDir()
afterAll(tmp.cleanup)

/** Loads one source with an explicit env and fetch, the way the CLI would. */
function load(source: SourceConfig, env: Record<string, string> = {}, fetch?: typeof globalThis.fetch) {
  return loadSecrets({ cwd: tmp.dir, config: { sources: [source] }, env, log: silentLogger, fetch })
}

describe("infisical", () => {
  const source = { provider: "infisical", domain: "http://10.20.30.40:8080", projectId: "p1", environment: "prod" }

  test("logs in, reads with imports underneath, then revokes the token it minted", async () => {
    const api = mockFetch({
      "POST /api/v1/auth/universal-auth/login": { accessToken: "tok-123" },
      "GET /api/v4/secrets": {
        secrets: [{ secretKey: "DATABASE_URL", secretValue: "postgres://own" }],
        imports: [
          {
            secrets: [
              { secretKey: "DATABASE_URL", secretValue: "postgres://imported" },
              { secretKey: "SHARED", secretValue: "1" },
            ],
          },
        ],
      },
      "POST /api/v1/auth/token/revoke": {},
    })
    const result = await load(source, { INFISICAL_CLIENT_ID: "id", INFISICAL_CLIENT_SECRET: "secret" }, api.fn)

    expect(result.secrets).toEqual({ DATABASE_URL: "postgres://own", SHARED: "1" })
    expect(result.withhold).toContain("INFISICAL_CLIENT_SECRET")
    expect(api.paths()).toEqual([
      "POST /api/v1/auth/universal-auth/login",
      "GET /api/v4/secrets",
      "POST /api/v1/auth/token/revoke",
    ])
    expect(JSON.parse(api.calls[0]?.body ?? "")).toEqual({ clientId: "id", clientSecret: "secret" })
    const read = api.calls[1]
    expect(read?.url.searchParams.get("environment")).toBe("prod")
    expect(read?.url.searchParams.get("projectId")).toBe("p1")
    expect(read?.url.searchParams.get("secretPath")).toBe("/")
    expect(read?.headers.get("authorization")).toBe("Bearer tok-123")
    expect(JSON.parse(api.calls[2]?.body ?? "")).toEqual({ accessToken: "tok-123" })
  })

  test("accepts the official CLI's variable names", async () => {
    const api = mockFetch({
      "POST /api/v1/auth/universal-auth/login": { accessToken: "t" },
      "GET /api/v4/secrets": { secrets: [] },
      "POST /api/v1/auth/token/revoke": {},
    })
    await load(source, { INFISICAL_UNIVERSAL_AUTH_CLIENT_ID: "a", INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET: "b" }, api.fn)
    expect(JSON.parse(api.calls[0]?.body ?? "")).toEqual({ clientId: "a", clientSecret: "b" })
  })

  test("revokes the token even when the read fails", async () => {
    const api = mockFetch({
      "POST /api/v1/auth/universal-auth/login": { accessToken: "t" },
      "GET /api/v4/secrets": new Response("forbidden", { status: 403 }),
      "POST /api/v1/auth/token/revoke": {},
    })
    await expect(load(source, { INFISICAL_CLIENT_ID: "a", INFISICAL_CLIENT_SECRET: "b" }, api.fn)).rejects.toThrow(
      "HTTP 403",
    )
    expect(api.paths()).toContain("POST /api/v1/auth/token/revoke")
  })

  test("a ready token is used as-is and never revoked", async () => {
    const api = mockFetch({ "GET /api/v4/secrets": { secrets: [{ secretKey: "A", secretValue: "1" }] } })
    const result = await load({ ...source, path: "/api", recursive: true }, { INFISICAL_TOKEN: "ready" }, api.fn)
    expect(result.secrets).toEqual({ A: "1" })
    expect(api.paths()).toEqual(["GET /api/v4/secrets"])
    expect(api.calls[0]?.url.searchParams.get("secretPath")).toBe("/api")
    expect(api.calls[0]?.url.searchParams.get("recursive")).toBe("true")
  })

  test("defaults: INFISICAL_DOMAIN and INFISICAL_PROJECT_ID, a trailing /api is tolerated", async () => {
    const api = mockFetch({ "GET /api/v4/secrets": { secrets: [] } })
    await load(
      { provider: "infisical", environment: "dev" },
      { INFISICAL_TOKEN: "t", INFISICAL_DOMAIN: "https://infisical.example.com/api/", INFISICAL_PROJECT_ID: "env-p" },
      api.fn,
    )
    expect(api.calls[0]?.url.origin).toBe("https://infisical.example.com")
    expect(api.calls[0]?.url.searchParams.get("projectId")).toBe("env-p")
  })

  test("missing credentials, project or environment are reported clearly", async () => {
    await expect(load(source)).rejects.toThrow("infisical: no credentials")
    await expect(load({ provider: "infisical", environment: "dev" }, { INFISICAL_TOKEN: "t" })).rejects.toThrow(
      '"projectId" is required',
    )
    await expect(load({ provider: "infisical", projectId: "p" }, { INFISICAL_TOKEN: "t" })).rejects.toThrow(
      '"environment" is required',
    )
  })

  test("plain HTTP to a public host is refused before anything is sent", async () => {
    const api = mockFetch({})
    await expect(
      load({ ...source, domain: "http://app.infisical.com" }, { INFISICAL_TOKEN: "t" }, api.fn),
    ).rejects.toThrow("plain HTTP")
    expect(api.calls).toHaveLength(0)
  })
})

describe("doppler", () => {
  test("downloads one config and stringifies values", async () => {
    const api = mockFetch({
      "GET /v3/configs/config/secrets/download": { API_KEY: "k", PORT: 3000, DEBUG: false, EMPTY: null },
    })
    const result = await load(
      { provider: "doppler", project: "web", config: "prd" },
      { DOPPLER_TOKEN: "dp.st" },
      api.fn,
    )
    expect(result.secrets).toEqual({ API_KEY: "k", PORT: "3000", DEBUG: "false" })
    expect(result.withhold).toEqual(["DOPPLER_TOKEN"])
    const call = api.calls[0]
    expect(call?.url.origin).toBe("https://api.doppler.com")
    expect(call?.url.searchParams.get("project")).toBe("web")
    expect(call?.url.searchParams.get("config")).toBe("prd")
    expect(call?.headers.get("authorization")).toBe("Bearer dp.st")
  })

  test("needs a token", async () => {
    await expect(load({ provider: "doppler" })).rejects.toThrow("doppler: no credentials")
  })
})

describe("vault", () => {
  test("reads KV v2 with a token and namespace", async () => {
    const api = mockFetch({ "GET /v1/kv/data/my%20app/prod": { data: { data: { A: "1", N: 2 } } } })
    const result = await load(
      { provider: "vault", address: "https://vault.example.com/", mount: "kv", path: "/my app/prod/" },
      { VAULT_TOKEN: "hvs.x", VAULT_NAMESPACE: "team" },
      api.fn,
    )
    expect(result.secrets).toEqual({ A: "1", N: "2" })
    expect(api.calls[0]?.headers.get("x-vault-token")).toBe("hvs.x")
    expect(api.calls[0]?.headers.get("x-vault-namespace")).toBe("team")
  })

  test("reads KV v1", async () => {
    const api = mockFetch({ "GET /v1/secret/app": { data: { B: "2" } } })
    const result = await load(
      { provider: "vault", address: "http://127.0.0.1:8200", path: "app", kvVersion: 1 },
      { VAULT_TOKEN: "t" },
      api.fn,
    )
    expect(result.secrets).toEqual({ B: "2" })
  })

  test("AppRole: logs in, reads, revokes the minted token", async () => {
    const api = mockFetch({
      "POST /v1/auth/ci/login": { auth: { client_token: "minted" } },
      "GET /v1/secret/data/app": { data: { data: { C: "3" } } },
      "POST /v1/auth/token/revoke-self": {},
    })
    const result = await load(
      { provider: "vault", address: "https://vault.example.com", path: "app", approleMount: "ci" },
      { VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "sid" },
      api.fn,
    )
    expect(result.secrets).toEqual({ C: "3" })
    expect(JSON.parse(api.calls[0]?.body ?? "")).toEqual({ role_id: "role", secret_id: "sid" })
    expect(api.calls[1]?.headers.get("x-vault-token")).toBe("minted")
    expect(api.paths().at(-1)).toBe("POST /v1/auth/token/revoke-self")
  })

  test("needs an address, a path and credentials", async () => {
    await expect(load({ provider: "vault", path: "a" }, { VAULT_TOKEN: "t" })).rejects.toThrow('"address" is required')
    await expect(load({ provider: "vault", address: "https://v.example.com" }, { VAULT_TOKEN: "t" })).rejects.toThrow(
      '"path" is required',
    )
    await expect(load({ provider: "vault", address: "https://v.example.com", path: "a" })).rejects.toThrow(
      "vault: no credentials",
    )
  })
})

describe("aws", () => {
  const creds = { AWS_ACCESS_KEY_ID: "AKIDEXAMPLE", AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" }

  test("SigV4 matches the AWS test suite (post-vanilla)", () => {
    const headers = signAwsRequest({
      url: new URL("https://example.amazonaws.com/"),
      region: "us-east-1",
      service: "service",
      body: "",
      headers: {},
      credentials: { accessKeyId: creds.AWS_ACCESS_KEY_ID, secretAccessKey: creds.AWS_SECRET_ACCESS_KEY },
      now: new Date("2015-08-30T12:36:00Z"),
    })
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b",
    )
  })

  test("signs GetSecretValue, sends the session token, expands JSON", async () => {
    const api = mockFetch({ "POST /": { SecretString: JSON.stringify({ DB: "x", PORT: 5432 }) } })
    const result = await load(
      { provider: "aws", region: "eu-west-1", secretId: "app/prod", versionStage: "AWSPREVIOUS" },
      { ...creds, AWS_SESSION_TOKEN: "session" },
      api.fn,
    )
    expect(result.secrets).toEqual({ DB: "x", PORT: "5432" })
    expect(result.withhold).toEqual([])
    const call = api.calls[0]
    expect(call?.url.host).toBe("secretsmanager.eu-west-1.amazonaws.com")
    expect(call?.headers.get("x-amz-target")).toBe("secretsmanager.GetSecretValue")
    expect(call?.headers.get("x-amz-security-token")).toBe("session")
    expect(call?.headers.get("authorization")).toMatch(
      /Credential=AKIDEXAMPLE\/\d{8}\/eu-west-1\/secretsmanager\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token;x-amz-target, Signature=[0-9a-f]{64}$/,
    )
    expect(JSON.parse(call?.body ?? "")).toEqual({ SecretId: "app/prod", VersionStage: "AWSPREVIOUS" })
  })

  test("binary and plain-text secrets, custom endpoint, AWS_DEFAULT_REGION", async () => {
    const api = mockFetch({ "POST /": { SecretBinary: Buffer.from("raw-token").toString("base64") } })
    const result = await load(
      { provider: "aws", secretId: "token", key: "API_TOKEN", endpoint: "http://localhost:4566/" },
      { ...creds, AWS_DEFAULT_REGION: "us-west-2" },
      api.fn,
    )
    expect(result.secrets).toEqual({ API_TOKEN: "raw-token" })
    expect(api.calls[0]?.url.host).toBe("localhost:4566")
  })

  test("needs credentials and a region", async () => {
    await expect(load({ provider: "aws", region: "us-east-1", secretId: "x" })).rejects.toThrow("aws: no credentials")
    await expect(load({ provider: "aws", secretId: "x" }, creds)).rejects.toThrow('"region" is required')
  })
})

describe("aws-ssm", () => {
  const creds = { AWS_ACCESS_KEY_ID: "AKID", AWS_SECRET_ACCESS_KEY: "secret", AWS_REGION: "eu-central-1" }

  test("reads every parameter under a path, across pages, decrypted", async () => {
    const api = mockFetch({
      "POST /": (call) => {
        const body = JSON.parse(call.body ?? "{}")
        expect(call.headers.get("x-amz-target")).toBe("AmazonSSM.GetParametersByPath")
        expect(body).toMatchObject({ Path: "/myapp/prod", Recursive: true, WithDecryption: true })
        return body.NextToken
          ? { Parameters: [{ Name: "/myapp/prod/db/URL", Value: "postgres://x" }] }
          : { Parameters: [{ Name: "/myapp/prod/API_KEY", Value: "k" }], NextToken: "page-2" }
      },
    })
    const result = await load({ provider: "ssm", path: "myapp/prod/" }, creds, api.fn)
    expect(result.secrets).toEqual({ API_KEY: "k", db_URL: "postgres://x" })
    expect(api.calls).toHaveLength(2)
    expect(api.calls[0]?.url.host).toBe("ssm.eu-central-1.amazonaws.com")
    expect(api.calls[0]?.headers.get("authorization")).toContain("/eu-central-1/ssm/aws4_request")
  })

  test("reads a list of names, and a missing one is an error", async () => {
    const api = mockFetch({
      "POST /": (call) => {
        const { Names } = JSON.parse(call.body ?? "{}")
        return Names.includes("/nope")
          ? { Parameters: [], InvalidParameters: ["/nope"] }
          : { Parameters: [{ Name: "/shared/stripe", Value: "sk" }] }
      },
    })
    const result = await load({ provider: "parameter-store", parameters: { STRIPE: "/shared/stripe" } }, creds, api.fn)
    expect(result.secrets).toEqual({ STRIPE: "sk" })
    await expect(load({ provider: "aws-ssm", parameters: ["/nope"] }, creds, api.fn)).rejects.toThrow(
      "no parameter named /nope",
    )
  })

  test("needs a path or names, and credentials", async () => {
    await expect(load({ provider: "aws-ssm" }, creds)).rejects.toThrow('set "path" or "parameters"')
    await expect(load({ provider: "aws-ssm", path: "/x", region: "us-east-1" })).rejects.toThrow(
      "aws-ssm: no credentials",
    )
  })
})

describe("gcp", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const keyFile = join(tmp.dir, "sa.json")
  writeFileSync(
    keyFile,
    JSON.stringify({
      type: "service_account",
      client_email: "app@proj.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    }),
  )
  const payload = (text: string) => ({ payload: { data: Buffer.from(text).toString("base64") } })

  test("service account: signs a valid JWT, then reads a bundle and mapped secrets", async () => {
    const api = mockFetch({
      "POST /token": (call) => {
        const form = new URLSearchParams(call.body)
        expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer")
        const [header = "", claims = "", signature = ""] = (form.get("assertion") ?? "").split(".")
        const valid = createVerify("RSA-SHA256")
          .update(`${header}.${claims}`)
          .verify(publicKey, Buffer.from(signature, "base64url"))
        expect(valid).toBe(true)
        const body = JSON.parse(Buffer.from(claims, "base64url").toString())
        expect(body.iss).toBe("app@proj.iam.gserviceaccount.com")
        expect(body.aud).toBe("https://oauth2.googleapis.com/token")
        expect(body.exp - body.iat).toBe(600)
        return { access_token: "ya29" }
      },
      "GET /v1/projects/proj/secrets/bundle/versions/latest:access": payload('{"A":"1"}'),
      "GET /v1/projects/proj/secrets/db-url/versions/3:access": payload("postgres://x"),
    })
    const result = await load(
      { provider: "gcp", project: "proj", secret: "bundle", secrets: { DATABASE_URL: "db-url@3" } },
      { GOOGLE_APPLICATION_CREDENTIALS: keyFile },
      api.fn,
    )
    expect(result.secrets).toEqual({ A: "1", DATABASE_URL: "postgres://x" })
    expect(api.calls[1]?.headers.get("authorization")).toBe("Bearer ya29")
  })

  test("an access token from the environment skips the exchange; a list maps names to themselves", async () => {
    const api = mockFetch({ "GET /v1/projects/p/secrets/TOKEN/versions/latest:access": payload("t") })
    const result = await load(
      { provider: "gcp", secrets: ["TOKEN"] },
      { GOOGLE_OAUTH_ACCESS_TOKEN: "ready", GOOGLE_CLOUD_PROJECT: "p" },
      api.fn,
    )
    expect(result.secrets).toEqual({ TOKEN: "t" })
    expect(api.paths()).toHaveLength(1)
  })

  test("authorized_user credentials use the refresh token", async () => {
    const file = join(tmp.dir, "adc.json")
    writeFileSync(
      file,
      JSON.stringify({ type: "authorized_user", client_id: "c", client_secret: "s", refresh_token: "r" }),
    )
    const api = mockFetch({
      "POST /token": (call) => {
        expect(new URLSearchParams(call.body).get("refresh_token")).toBe("r")
        return { access_token: "u" }
      },
      "GET /v1/projects/p/secrets/s/versions/latest:access": payload("v"),
    })
    const result = await load(
      { provider: "gcp", project: "p", secret: "s", key: "S" },
      { GOOGLE_APPLICATION_CREDENTIALS: file },
      api.fn,
    )
    expect(result.secrets).toEqual({ S: "v" })
  })

  test("refuses a token_uri over plain HTTP, and a config naming nothing", async () => {
    const file = join(tmp.dir, "bad.json")
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(keyFile, "utf8")), token_uri: "http://evil.example.com/token" }),
    )
    await expect(
      load({ provider: "gcp", project: "p", secret: "s" }, { GOOGLE_APPLICATION_CREDENTIALS: file }),
    ).rejects.toThrow("plain HTTP")
    await expect(load({ provider: "gcp", project: "p" }, { GOOGLE_OAUTH_ACCESS_TOKEN: "t" })).rejects.toThrow(
      'set "secret"',
    )
  })
})

describe("azure", () => {
  const sp = { AZURE_TENANT_ID: "tenant", AZURE_CLIENT_ID: "client", AZURE_CLIENT_SECRET: "secret" }
  const vault = "https://my-vault.vault.azure.net"

  test("lists every enabled secret across pages and maps dashes to underscores", async () => {
    const api = mockFetch({
      "POST /tenant/oauth2/v2.0/token": (call) => {
        const form = new URLSearchParams(call.body)
        expect(form.get("grant_type")).toBe("client_credentials")
        expect(form.get("scope")).toBe("https://vault.azure.net/.default")
        return { access_token: "az" }
      },
      "GET /secrets": (call) =>
        call.url.searchParams.has("page")
          ? { value: [{ id: `${vault}/secrets/API-KEY` }, { id: `${vault}/secrets/CERT`, managed: true }] }
          : {
              value: [
                { id: `${vault}/secrets/DATABASE-URL` },
                { id: `${vault}/secrets/OFF`, attributes: { enabled: false } },
              ],
              nextLink: `${vault}/secrets?api-version=7.4&page=2`,
            },
      "GET /secrets/DATABASE-URL": { value: "postgres://x" },
      "GET /secrets/API-KEY": { value: "k" },
    })
    const result = await load({ provider: "azure", vault: "my-vault" }, sp, api.fn)
    expect(result.secrets).toEqual({ DATABASE_URL: "postgres://x", API_KEY: "k" })
    expect(api.calls.at(-1)?.headers.get("authorization")).toBe("Bearer az")
  })

  test("a mapping reads only the named secrets, with a ready token", async () => {
    const api = mockFetch({ "GET /secrets/stripe-key": { value: "sk" } })
    const result = await load(
      { provider: "azure", vault, secrets: { STRIPE: "stripe-key" } },
      { AZURE_KEYVAULT_TOKEN: "ready" },
      api.fn,
    )
    expect(result.secrets).toEqual({ STRIPE: "sk" })
    expect(result.withhold).toEqual(["AZURE_KEYVAULT_TOKEN"])
  })

  test("never follows a nextLink out of the vault", async () => {
    const api = mockFetch({ "GET /secrets": { value: [], nextLink: "https://evil.example.com/secrets" } })
    await expect(load({ provider: "azure", vault: "my-vault" }, { AZURE_KEYVAULT_TOKEN: "t" }, api.fn)).rejects.toThrow(
      "unexpected nextLink",
    )
  })

  test("refuses vault names that are not names", async () => {
    for (const bad of ["evil.com/x?", "a", "has_underscore", "x".repeat(25)]) {
      await expect(load({ provider: "azure", vault: bad }, { AZURE_KEYVAULT_TOKEN: "t" })).rejects.toThrow(
        "not a valid vault name",
      )
    }
    await expect(
      load({ provider: "azure", vault: "https://v.vault.azure.net/path" }, { AZURE_KEYVAULT_TOKEN: "t" }),
    ).rejects.toThrow("just the origin")
    await expect(load({ provider: "azure", vault: "my-vault" })).rejects.toThrow("azure: no credentials")
  })
})

describe("1password", () => {
  const item = {
    fields: [
      { label: "DATABASE_URL", value: "postgres://x" },
      { label: "secret key", value: "sk" },
      { label: "notesPlain", value: "n", purpose: "NOTES" },
      { label: "EMPTY", value: "" },
    ],
  }

  test("runs op with the right arguments and keeps fields named like env vars", async () => {
    const cli = fakeCli(tmp.dir, "op", { stdout: JSON.stringify(item) })
    const result = await load({ provider: "1password", item: "app", vault: "Eng", account: "team", cli })
    expect(result.secrets).toEqual({ DATABASE_URL: "postgres://x" })
    expect(result.withhold).toEqual(["OP_SERVICE_ACCOUNT_TOKEN"])
    const args = JSON.parse(readFileSync(join(tmp.dir, "op.args.json"), "utf8"))
    expect(args).toEqual(["item", "get", "app", "--format", "json", "--reveal", "--vault", "Eng", "--account", "team"])
  })

  test("maps fields explicitly, and a missing label is an error", async () => {
    const cli = fakeCli(tmp.dir, "op2", { stdout: JSON.stringify(item) })
    const result = await load({ provider: "1password", item: "app", fields: { STRIPE: "secret key" }, cli })
    expect(result.secrets).toEqual({ STRIPE: "sk" })
    await expect(load({ provider: "1password", item: "app", fields: ["NOPE"], cli })).rejects.toThrow('no field "NOPE"')
  })

  test("a failing CLI is reported with its stderr, cleaned of control characters", async () => {
    const cli = fakeCli(tmp.dir, "op3", { stderr: "\u001b[31m[ERROR] not signed in\u001b[0m", code: 1 })
    const error = await load({ provider: "1password", item: "app", cli }).catch((e: Error) => e)
    expect(String(error)).toContain("not signed in")
    expect(String(error)).not.toContain("\u001b")
  })

  test("values that would read as flags are refused", async () => {
    await expect(load({ provider: "1password", item: "--help" })).rejects.toThrow("does not start with '-'")
  })

  test("a missing CLI says how to install it", async () => {
    await expect(load({ provider: "1password", item: "x", cli: "definitely-not-op-xyz" })).rejects.toThrow(
      "not installed",
    )
  })
})

describe("bitwarden", () => {
  test("lists a project's secrets through bws", async () => {
    const cli = fakeCli(tmp.dir, "bws", {
      stdout: JSON.stringify([
        { key: "A", value: "1" },
        { key: "B", value: "2" },
      ]),
    })
    const result = await load(
      { provider: "bitwarden", projectId: "proj", serverUrl: "https://vault.bitwarden.eu", cli },
      { BWS_ACCESS_TOKEN: "t" },
    )
    expect(result.secrets).toEqual({ A: "1", B: "2" })
    const args = JSON.parse(readFileSync(join(tmp.dir, "bws.args.json"), "utf8"))
    expect(args).toEqual(["secret", "list", "proj", "--output", "json", "--server-url", "https://vault.bitwarden.eu"])
  })

  test("needs a token, and rejects invalid JSON", async () => {
    await expect(load({ provider: "bitwarden" })).rejects.toThrow("bitwarden: no credentials")
    const cli = fakeCli(tmp.dir, "bws2", { stdout: "not json" })
    await expect(load({ provider: "bitwarden", cli }, { BWS_ACCESS_TOKEN: "t" })).rejects.toThrow("invalid JSON")
  })
})

describe("sops", () => {
  test("decrypts to JSON through the CLI, relative to the config, and withholds the age key", async () => {
    const cli = fakeCli(tmp.dir, "sops", { stdout: JSON.stringify({ DB: "x", PORT: 5432, nested: { a: 1 } }) })
    const result = await load({ provider: "sops", file: "secrets.prod.env", cli }, { SOPS_AGE_KEY: "AGE-SECRET-KEY-1" })
    expect(result.secrets).toEqual({ DB: "x", PORT: "5432", nested: '{"a":1}' })
    expect(result.withhold).toContain("SOPS_AGE_KEY")
    const args = JSON.parse(readFileSync(join(tmp.dir, "sops.args.json"), "utf8"))
    expect(args).toEqual(["--decrypt", "--output-type", "json", join(tmp.dir, "secrets.prod.env")])
  })

  test("a file that is not a map, a missing file option, and flag-like values are errors", async () => {
    const cli = fakeCli(tmp.dir, "sops2", { stdout: "[1,2]" })
    await expect(load({ provider: "sops", file: "x.json", cli })).rejects.toThrow("does not hold a map")
    await expect(load({ provider: "sops" })).rejects.toThrow('"file" is required')
    await expect(load({ provider: "sops", file: "x.env", inputType: "--exec-env" })).rejects.toThrow(
      "does not start with '-'",
    )
  })
})

describe("exec", () => {
  test("reads dotenv output by default, in the config's directory", async () => {
    const cli = fakeCli(tmp.dir, "esc", { stdout: 'API_KEY="k"\nDATABASE_URL=postgres://x\n' })
    const result = await load({ provider: "exec", command: cli, args: ["env", "open", "org/app/dev"] })
    expect(result.secrets).toEqual({ API_KEY: "k", DATABASE_URL: "postgres://x" })
    expect(JSON.parse(readFileSync(join(tmp.dir, "esc.args.json"), "utf8"))).toEqual(["env", "open", "org/app/dev"])
  })

  test("reads JSON, or the whole output under a key", async () => {
    const json = fakeCli(tmp.dir, "json-cli", { stdout: '{"A":"1","B":true}' })
    expect((await load({ provider: "command", command: json })).secrets).toEqual({ A: "1", B: "true" })
    const raw = fakeCli(tmp.dir, "raw-cli", { stdout: "one-token\n" })
    expect((await load({ provider: "exec", command: raw, key: "TOKEN" })).secrets).toEqual({ TOKEN: "one-token" })
  })

  test("withhold removes the source's own credentials from the child", async () => {
    const cli = fakeCli(tmp.dir, "esc2", { stdout: "A=1\n" })
    const result = await load({ provider: "exec", command: cli, withhold: ["PULUMI_ACCESS_TOKEN"] })
    expect(result.withhold).toEqual(["PULUMI_ACCESS_TOKEN"])
  })

  test("a failing or missing command is reported", async () => {
    const cli = fakeCli(tmp.dir, "fail-cli", { stderr: "not logged in", code: 2 })
    await expect(load({ provider: "exec", command: cli })).rejects.toThrow("not logged in")
    await expect(load({ provider: "exec", command: "definitely-not-a-cli-xyz" })).rejects.toThrow("not installed")
    await expect(load({ provider: "exec" })).rejects.toThrow('"command" is required')
  })
})

describe("dotenv", () => {
  test("merges files in order; missing files are optional only when asked", async () => {
    writeFileSync(join(tmp.dir, ".env"), "A=1\nB=base\n")
    writeFileSync(join(tmp.dir, ".env.local"), "B=local\n")
    expect((await load({ provider: "dotenv", path: [".env", ".env.local"] })).secrets).toEqual({ A: "1", B: "local" })
    expect((await load({ provider: "dotenv" })).secrets).toEqual({ A: "1", B: "base" })
    expect((await load({ provider: "dotenv", path: "missing.env", required: false })).secrets).toEqual({})
    await expect(load({ provider: "env", path: "missing.env" })).rejects.toThrow("Cannot read env file")
  })
})
