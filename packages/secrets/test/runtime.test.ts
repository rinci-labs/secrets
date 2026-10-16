import { afterAll, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "../src/args.js"
import { assertTrustedFile, findConfig, readConfig } from "../src/config.js"
import { parseDotenv } from "../src/dotenv.js"
import { SecretsError } from "../src/errors.js"
import { mapLimit, request, requestJson } from "../src/http.js"
import { isValidKey, loadSecrets } from "../src/load.js"
import { silentLogger, type Logger } from "../src/log.js"
import { getProvider, listProviders } from "../src/providers/index.js"
import { options } from "../src/providers/types.js"
import { runWithSecrets } from "../src/run.js"
import { resolveWindowsCommand } from "../src/spawn.js"
import { hasControlChars, sanitize } from "../src/text.js"
import { mockFetch, tempDir } from "./helpers.js"

const tmp = tempDir()
afterAll(tmp.cleanup)

function capture(): Logger & { lines: string[] } {
  const lines: string[] = []
  const push = (m: string) => lines.push(m)
  return { level: "verbose", lines, error: push, warn: push, info: push, debug: push }
}

describe("text", () => {
  test("strips terminal escapes and truncates", () => {
    expect(sanitize("\u001b]0;pwned\u0007ok\r\nnext")).toBe("]0;pwned ok next")
    expect(sanitize("x".repeat(400))).toHaveLength(301)
    expect(hasControlChars("A\u001bB")).toBe(true)
    expect(hasControlChars("plain")).toBe(false)
  })
})

describe("dotenv parser", () => {
  test("is linear on hostile input", () => {
    const started = performance.now()
    parseDotenv(`A="${"\\".repeat(50_000)}`)
    parseDotenv(`A=${" ".repeat(50_000)}#`)
    parseDotenv(`${"A".repeat(50_000)}`)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe("request", () => {
  test("retries 5xx for idempotent calls, then succeeds", async () => {
    let n = 0
    const api = mockFetch({ "GET /x": () => (++n < 3 ? new Response("busy", { status: 503 }) : { ok: true }) })
    expect(await requestJson("https://api.example.com/x", { what: "x", retries: 2, fetch: api.fn })).toEqual({
      ok: true,
    })
    expect(api.calls).toHaveLength(3)
    expect(api.calls.every((c) => c.redirect === "error")).toBe(true)
  })

  test("does not retry without retries, nor on 4xx", async () => {
    const api = mockFetch({
      "POST /x": new Response("busy", { status: 503 }),
      "GET /y": new Response("", { status: 404 }),
    })
    await expect(request("https://a.example.com/x", { what: "x", method: "POST", fetch: api.fn })).rejects.toThrow(
      "HTTP 503",
    )
    await expect(request("https://a.example.com/y", { what: "y", retries: 3, fetch: api.fn })).rejects.toThrow(
      "HTTP 404",
    )
    expect(api.calls).toHaveLength(2)
  })

  test("auth failures carry a hint; error bodies are cleaned", async () => {
    const api = mockFetch({ "GET /x": new Response("\u001b[2Jdenied\nfor you", { status: 401 }) })
    const error = (await request("https://a.example.com/x", { what: "Login", fetch: api.fn }).catch(
      (e) => e,
    )) as SecretsError
    expect(error.message).toBe("Login failed: HTTP 401 [2Jdenied for you")
    expect(error.hint).toContain("credentials")
  })

  test("times out", async () => {
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      )) as typeof fetch
    await expect(request("https://a.example.com", { what: "Slow", timeoutMs: 20, fetch: slow })).rejects.toThrow(
      "timed out after 20ms",
    )
  })

  test("network errors name the cause and the host", async () => {
    const down = (() =>
      Promise.reject(
        Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
      )) as unknown as typeof fetch
    const error = (await request("http://10.0.0.1:8080/x", { what: "Read", fetch: down }).catch(
      (e) => e,
    )) as SecretsError
    expect(error.message).toBe("Read failed: ECONNREFUSED")
    expect(error.hint).toContain("http://10.0.0.1:8080")
  })

  test("invalid JSON is reported", async () => {
    const api = mockFetch({ "GET /": new Response("<html>") })
    await expect(requestJson("https://a.example.com/", { what: "API", fetch: api.fn })).rejects.toThrow(
      "API returned invalid JSON",
    )
  })

  test("mapLimit keeps order and bounds concurrency", async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      peak = Math.max(peak, ++active)
      await Bun.sleep(5)
      active--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBe(2)
  })
})

describe("config discovery", () => {
  const root = join(tmp.dir, "discovery")
  const repo = join(root, "repo")
  const deep = join(repo, "apps", "web")
  mkdirSync(deep, { recursive: true })
  writeFileSync(join(root, "secrets.config.json"), "{}")

  test("walks up to the nearest config", () => {
    writeFileSync(join(repo, ".secretsrc.json"), "{}")
    expect(findConfig(deep, tmp.dir)).toBe(join(repo, ".secretsrc.json"))
  })

  test("stops at a repository root, never reading a parent's config", () => {
    const other = join(root, "other")
    mkdirSync(join(other, ".git"), { recursive: true })
    mkdirSync(join(other, "src"), { recursive: true })
    expect(findConfig(join(other, "src"), tmp.dir)).toBeUndefined()
  })

  test("stops at the home directory", () => {
    const home = join(root, "home")
    mkdirSync(join(home, "project"), { recursive: true })
    expect(findConfig(join(home, "project"), home)).toBeUndefined()
  })

  test("invalid JSON and invalid shape are both reported with the path", async () => {
    const bad = join(tmp.dir, "bad.json")
    writeFileSync(bad, "{ nope")
    await expect(readConfig(bad)).rejects.toThrow(`Cannot read config ${bad}`)
    writeFileSync(bad, '{"sources": []}')
    await expect(readConfig(bad)).rejects.toThrow('"sources" must be a non-empty array')
  })

  test.skipIf(process.platform === "win32")("refuses a world-writable config", async () => {
    const file = join(tmp.dir, "open.json")
    writeFileSync(file, '{"sources":[{"provider":"dotenv"}]}')
    chmodSync(file, 0o666)
    await expect(assertTrustedFile(file)).rejects.toThrow("anyone on this machine can edit it")
    chmodSync(file, 0o644)
    await expect(assertTrustedFile(file)).resolves.toBeUndefined()
  })
})

describe("loadSecrets", () => {
  const dir = join(tmp.dir, "load")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, ".env.creds"), "DOPPLER_TOKEN=from-file\nEXTRA=1\n")
  writeFileSync(join(dir, "a.env"), "A=1\nSHARED=a\n")
  writeFileSync(join(dir, "b.env"), "B=2\nSHARED=b\n")

  const config = {
    sources: [
      { provider: "dotenv", name: "a", path: "a.env" },
      { provider: "dotenv", name: "b", path: "b.env" },
    ],
  }

  test("later sources win, and each report lists its keys", async () => {
    const result = await loadSecrets({ cwd: dir, config, env: {}, log: silentLogger })
    expect(result.secrets).toEqual({ A: "1", B: "2", SHARED: "b" })
    expect(result.sources.map((s) => [s.name, s.keys])).toEqual([
      ["a", ["A", "SHARED"]],
      ["b", ["B", "SHARED"]],
    ])
  })

  test("--source picks sources, and an unknown name is an error", async () => {
    const result = await loadSecrets({ cwd: dir, config, env: {}, sources: ["a"], log: silentLogger })
    expect(result.secrets).toEqual({ A: "1", SHARED: "a" })
    await expect(loadSecrets({ cwd: dir, config, env: {}, sources: ["c"], log: silentLogger })).rejects.toThrow(
      'No source named "c"',
    )
  })

  test("SECRETS_ENV and fallbacks are interpolated", async () => {
    writeFileSync(join(dir, "prod.env"), "STAGE=prod\n")
    writeFileSync(join(dir, "dev.env"), "STAGE=dev\n")
    const cfg = { sources: [{ provider: "dotenv", path: "${SECRETS_ENV:-dev}.env" }] }
    expect((await loadSecrets({ cwd: dir, config: cfg, env: {}, log: silentLogger })).secrets).toEqual({ STAGE: "dev" })
    expect(
      (await loadSecrets({ cwd: dir, config: cfg, env: {}, environment: "prod", log: silentLogger })).secrets,
    ).toEqual({ STAGE: "prod" })
    await expect(
      loadSecrets({
        cwd: dir,
        config: { sources: [{ provider: "dotenv", path: "${NOPE}" }] },
        env: {},
        log: silentLogger,
      }),
    ).rejects.toThrow("NOPE")
  })

  test("env files feed providers; the real environment wins over them", async () => {
    const api = mockFetch({ "GET /v3/configs/config/secrets/download": {} })
    const cfg = { envFiles: [".env.creds", ".env.missing"], sources: [{ provider: "doppler" }] }
    await loadSecrets({ cwd: dir, config: cfg, env: {}, log: silentLogger, fetch: api.fn })
    expect(api.calls[0]?.headers.get("authorization")).toBe("Bearer from-file")
    await loadSecrets({ cwd: dir, config: cfg, env: { DOPPLER_TOKEN: "real" }, log: silentLogger, fetch: api.fn })
    expect(api.calls[1]?.headers.get("authorization")).toBe("Bearer real")
  })

  test("--env-file must exist", async () => {
    await expect(loadSecrets({ cwd: dir, config, env: {}, envFiles: ["nope.env"], log: silentLogger })).rejects.toThrow(
      "Cannot read env file",
    )
  })

  test("fails closed, and reports every failure at once", async () => {
    const cfg = {
      sources: [
        { provider: "dotenv", name: "ok", path: "a.env" },
        { provider: "dotenv", name: "x", path: "missing-1.env" },
        { provider: "dotenv", name: "y", path: "missing-2.env" },
      ],
    }
    const error = await loadSecrets({ cwd: dir, config: cfg, env: {}, log: silentLogger }).catch((e: Error) => e)
    expect(String(error)).toContain("2 sources failed")
  })

  test("optional sources are skipped with a warning", async () => {
    const log = capture()
    const cfg = {
      sources: [
        { provider: "dotenv", path: "missing.env", optional: true },
        { provider: "env", path: "a.env" },
      ],
    }
    const result = await loadSecrets({ cwd: dir, config: cfg, env: {}, log })
    expect(result.secrets).toEqual({ A: "1", SHARED: "a" })
    expect(result.sources[0]?.error).toContain("Cannot read env file")
    expect(log.lines.some((l) => l.includes('source "dotenv" skipped'))).toBe(true)
  })

  test("keys a process cannot hold are dropped with a warning", async () => {
    const log = capture()
    const api = mockFetch({
      "GET /v3/configs/config/secrets/download": { OK: "1", "A=B": "x", "ESC\u001b": "x", __proto__: "x", NUL: "a\0b" },
    })
    const result = await loadSecrets({
      config: { sources: [{ provider: "doppler" }] },
      env: { DOPPLER_TOKEN: "t" },
      log,
      fetch: api.fn,
    })
    expect(Object.keys(result.secrets)).toEqual(["OK"])
    expect(log.lines.filter((l) => l.includes("not a valid env var"))).toHaveLength(3)
    expect(isValidKey("__proto__")).toBe(false)
    expect(isValidKey("")).toBe(false)
  })

  test("no config is a clear error", async () => {
    const empty = join(tmp.dir, "empty")
    mkdirSync(join(empty, ".git"), { recursive: true })
    await expect(loadSecrets({ cwd: empty, env: {}, log: silentLogger })).rejects.toThrow(
      "No secrets.config.json found",
    )
  })
})

describe("providers registry", () => {
  test("aliases resolve, unknown names list the options", () => {
    expect(getProvider("hashicorp").name).toBe("vault")
    expect(getProvider("op").name).toBe("1password")
    expect(getProvider("gcp-secret-manager").name).toBe("gcp")
    expect(() => getProvider("nope")).toThrow("Unknown provider")
    expect(() => getProvider("constructor")).toThrow("Unknown provider")
    expect(listProviders().map((p) => p.name)).toEqual([
      "infisical",
      "doppler",
      "vault",
      "aws",
      "aws-ssm",
      "gcp",
      "azure",
      "1password",
      "bitwarden",
      "sops",
      "dotenv",
      "exec",
    ])
    expect(getProvider("ssm").name).toBe("aws-ssm")
    expect(getProvider("command").name).toBe("exec")
  })

  test("option helpers validate types", () => {
    const opt = options("src", { n: "5", bad: "x", b: "true", list: "a", map: { A: "a" }, flag: "-x" })
    expect(opt.number("n", 1)).toBe(5)
    expect(opt.number("unset", 1)).toBe(1)
    expect(() => opt.number("bad", 1)).toThrow("a positive number")
    expect(opt.boolean("b")).toBe(true)
    expect(opt.stringList("list")).toEqual(["a"])
    expect(opt.mapping("map")).toEqual({ A: "a" })
    expect(() => opt.argument("flag")).toThrow("does not start with '-'")
    expect(() => opt.required("missing")).toThrow('"missing" is required')
  })
})

describe("parseArgs", () => {
  test("options without a command mean run; nothing at all means help", () => {
    expect(parseArgs(["-e", "prod", "--", "bun", "dev"])).toMatchObject({ command: "run", rest: ["bun", "dev"] })
    expect(parseArgs([]).command).toBe("help")
    expect(parseArgs(["-v"]).command).toBe("help")
    expect(parseArgs(["list", "--version"]).command).toBe("version")
    expect(() => parseArgs(["run", "-e"])).toThrow("-e needs a value")
    expect(() => parseArgs(["run", "--pure=yes", "x"])).toThrow("Unknown option --pure")
  })
})

describe("spawn", () => {
  test.if(process.platform === "win32")("never resolves a command from the current directory", () => {
    const dir = join(tmp.dir, "cwd-hijack")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "hijack-me.cmd"), "@echo pwned")
    const previous = process.cwd()
    process.chdir(dir)
    try {
      expect(resolveWindowsCommand("hijack-me", { PATH: "C:\\nowhere", PATHEXT: ".CMD" })).toBeUndefined()
      expect(resolveWindowsCommand(join(dir, "hijack-me.cmd"), { PATH: "" })).toBe(join(dir, "hijack-me.cmd"))
    } finally {
      process.chdir(previous)
    }
  })
})

describe("runWithSecrets", () => {
  const dir = join(tmp.dir, "run")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, ".env"), "INJECTED=yes\nPATH_LIKE=1\n")
  const config = { sources: [{ provider: "dotenv" }] }
  const node = "node"
  const script = (body: string) => ["-e", body]

  test("injects secrets and passes the exit code through", async () => {
    const result = await runWithSecrets(node, script("process.exit(process.env.INJECTED === 'yes' ? 7 : 1)"), {
      cwd: dir,
      config,
      log: silentLogger,
    })
    expect(result.code).toBe(7)
  })

  test("--no-override keeps the existing value; --pure drops the rest", async () => {
    const env = { ...process.env, INJECTED: "already", UNRELATED: "x" }
    const kept = await runWithSecrets(node, script("process.exit(process.env.INJECTED === 'already' ? 0 : 1)"), {
      cwd: dir,
      config,
      env,
      override: false,
      log: silentLogger,
    })
    expect(kept.code).toBe(0)
    const pure = await runWithSecrets(node, script("process.exit(process.env.UNRELATED ? 1 : 0)"), {
      cwd: dir,
      config,
      env,
      pure: true,
      log: silentLogger,
    })
    expect(pure.code).toBe(0)
  })

  test("a missing command exits 127 with a clear message", async () => {
    await expect(
      runWithSecrets("definitely-not-a-command-xyz", [], { cwd: dir, config, log: silentLogger }),
    ).rejects.toMatchObject({ exitCode: 127 })
  })
})
