import { describe, expect, test } from "bun:test"
import { parseArgs } from "../src/args.js"
import { formatExport } from "../src/commands.js"
import { validateConfig } from "../src/config.js"
import { parseDotenv, stringifyDotenv } from "../src/dotenv.js"
import { buildChildEnv } from "../src/env.js"
import { assertSecureUrl, isPrivateHost } from "../src/http.js"
import { interpolate, interpolateDeep } from "../src/interpolate.js"
import { parsePayload } from "../src/providers/types.js"
import { escapeCmdArgument } from "../src/spawn.js"

describe("parseDotenv", () => {
  test("reads the common forms", () => {
    const parsed = parseDotenv(
      [
        "# comment",
        "PLAIN=value",
        "export EXPORTED=yes",
        "SPACED = padded  ",
        "INLINE=abc # trailing comment",
        "SINGLE='keep $HOME and \\n'",
        'DOUBLE="line1\\nline2 \\"quoted\\""',
        'MULTI="a',
        'b"',
        "EMPTY=",
        "DUP=1",
        "DUP=2",
      ].join("\r\n"),
    )
    expect(parsed).toEqual({
      PLAIN: "value",
      EXPORTED: "yes",
      SPACED: "padded",
      INLINE: "abc",
      SINGLE: "keep $HOME and \\n",
      DOUBLE: 'line1\nline2 "quoted"',
      MULTI: "a\nb",
      EMPTY: "",
      DUP: "2",
    })
  })

  test("stringify round-trips awkward values", () => {
    const values = { A: 'quote " and \\ backslash', B: "new\nline\ttab", C: "# not a comment", D: "" }
    expect(parseDotenv(stringifyDotenv(values))).toEqual(values)
  })
})

describe("interpolate", () => {
  const env = { NAME: "prod", EMPTY: "" }
  test("expands, falls back and escapes", () => {
    expect(interpolate("app-${NAME}", env)).toBe("app-prod")
    expect(interpolate("${MISSING:-dev}", env)).toBe("dev")
    expect(interpolate("${EMPTY:-dev}", env)).toBe("dev")
    expect(interpolate("cost $$5", env)).toBe("cost $5")
  })
  test("an unset reference without a fallback is an error", () => {
    expect(() => interpolate("${MISSING}", env)).toThrow("MISSING")
  })
  test("walks nested values", () => {
    expect(interpolateDeep({ a: ["${NAME}"], b: { c: "${NAME}" }, d: 1 }, env)).toEqual({
      a: ["prod"],
      b: { c: "prod" },
      d: 1,
    })
  })
})

describe("transport", () => {
  test("private hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.20.30.40",
      "172.20.0.1",
      "192.168.1.5",
      "100.96.0.1",
      "infisical.secrets.svc.cluster.local",
      "[::1]",
      "[fd00::1]",
    ]) {
      expect(isPrivateHost(host)).toBe(true)
    }
    for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "secrets.example.org"]) {
      expect(isPrivateHost(host)).toBe(false)
    }
  })
  test("plain HTTP is refused for public hosts only", () => {
    expect(assertSecureUrl("http://10.20.30.40:8080").host).toBe("10.20.30.40:8080")
    expect(assertSecureUrl("https://app.infisical.com").protocol).toBe("https:")
    expect(() => assertSecureUrl("http://app.infisical.com")).toThrow("plain HTTP")
    expect(assertSecureUrl("http://app.infisical.com", { allowInsecure: true }).protocol).toBe("http:")
    expect(() => assertSecureUrl("ftp://x")).toThrow()
  })
})

describe("buildChildEnv", () => {
  const base = { PATH: "/bin", HOME: "/home/a", EXISTING: "old", INFISICAL_CLIENT_SECRET: "s3cr3t", OTHER: "x" }

  test("overrides by default and withholds credentials", () => {
    const result = buildChildEnv(
      { EXISTING: "new", NEW: "1" },
      { base, withhold: ["INFISICAL_CLIENT_SECRET"], caseInsensitive: false },
    )
    expect(result.env.EXISTING).toBe("new")
    expect(result.env.NEW).toBe("1")
    expect(result.env.INFISICAL_CLIENT_SECRET).toBeUndefined()
    expect(result.overridden).toEqual(["EXISTING"])
    expect(result.added).toEqual(["NEW"])
    expect(result.withheld).toEqual(["INFISICAL_CLIENT_SECRET"])
  })

  test("no-override keeps existing values", () => {
    const result = buildChildEnv({ EXISTING: "new" }, { base, override: false, caseInsensitive: false })
    expect(result.env.EXISTING).toBe("old")
    expect(result.kept).toEqual(["EXISTING"])
  })

  test("pure keeps only the basics", () => {
    const result = buildChildEnv({ A: "1" }, { base, pure: true, caseInsensitive: false })
    expect(Object.keys(result.env).toSorted()).toEqual(["A", "HOME", "PATH"])
  })

  test("Windows names are matched case-insensitively", () => {
    const result = buildChildEnv({ path: "C:\\x" }, { base: { Path: "C:\\Windows" }, caseInsensitive: true })
    expect(result.env).toEqual({ path: "C:\\x" })
    expect(result.overridden).toEqual(["path"])
  })
})

describe("parseArgs", () => {
  test("stops at the first non-option for run", () => {
    const parsed = parseArgs(["run", "-e", "prod", "--source=api", "bun", "dev", "--port", "3000"])
    expect(parsed.command).toBe("run")
    expect(parsed.flags.env).toBe("prod")
    expect(parsed.flags.source).toEqual(["api"])
    expect(parsed.rest).toEqual(["bun", "dev", "--port", "3000"])
  })
  test("-- starts the command", () => {
    expect(parseArgs(["--", "node", "-v"])).toMatchObject({ command: "run", rest: ["node", "-v"] })
    expect(parseArgs(["run", "--pure", "--", "--weird"]).rest).toEqual(["--weird"])
  })
  test("rejects unknown options and commands", () => {
    expect(() => parseArgs(["run", "--nope", "x"])).toThrow("Unknown option")
    expect(() => parseArgs(["bun", "dev"])).toThrow("Unknown command")
  })
})

describe("validateConfig", () => {
  test("accepts a normal config", () => {
    expect(validateConfig({ sources: [{ provider: "doppler" }] }).sources).toHaveLength(1)
  })
  test("refuses credentials in the file", () => {
    expect(() => validateConfig({ sources: [{ provider: "infisical", clientSecret: "x" }] })).toThrow("credential")
    expect(() => validateConfig({ sources: [{ provider: "vault", token: "x" }] })).toThrow("credential")
  })
  test("refuses duplicate names and unknown keys", () => {
    expect(() => validateConfig({ sources: [{ provider: "dotenv" }, { provider: "dotenv" }] })).toThrow("named")
    expect(() => validateConfig({ sources: [{ provider: "dotenv" }], extra: 1 })).toThrow("unknown key")
  })
})

describe("parsePayload", () => {
  test("auto reads JSON objects and stringifies non-strings", () => {
    expect(parsePayload('{"A":"1","B":2,"C":{"d":true}}', { label: "x" })).toEqual({ A: "1", B: "2", C: '{"d":true}' })
  })
  test("auto falls back to raw with a key", () => {
    expect(parsePayload("plain", { label: "x", key: "TOKEN" })).toEqual({ TOKEN: "plain" })
    expect(() => parsePayload("plain", { label: "x" })).toThrow("not a JSON object")
  })
  test("dotenv format", () => {
    expect(parsePayload("A=1\nB=2", { label: "x", format: "dotenv" })).toEqual({ A: "1", B: "2" })
  })
})

describe("formatExport", () => {
  const secrets = { A: "it's", B: 'say "hi"' }
  test("shell and powershell quote safely", () => {
    expect(formatExport(secrets, "shell")).toBe(`export A='it'\\''s'\nexport B='say "hi"'`)
    expect(formatExport(secrets, "powershell")).toBe(`$env:A = 'it''s'\n$env:B = 'say "hi"'`)
  })
  test("shell formats skip names a shell cannot hold", () => {
    const warnings: string[] = []
    expect(formatExport({ "a.b": "1", OK: "2" }, "shell", (w) => warnings.push(w))).toBe("export OK='2'")
    expect(warnings).toHaveLength(1)
  })
})

describe("escapeCmdArgument", () => {
  test("quotes and escapes cmd metacharacters", () => {
    expect(escapeCmdArgument("simple")).toBe('^"simple^"')
    expect(escapeCmdArgument("a&b|c")).toBe('^"a^&b^|c^"')
    expect(escapeCmdArgument('say "hi"')).toBe('^"say^ \\^"hi\\^"^"')
    expect(escapeCmdArgument("trail\\")).toBe('^"trail\\\\^"')
  })
})
