import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { tempDir } from "./helpers.js"

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const tmp = tempDir()
afterAll(tmp.cleanup)

writeFileSync(join(tmp.dir, ".env"), "API_KEY=abc\nQUOTE=it's\n")
writeFileSync(join(tmp.dir, ".env.extra"), "EXTRA=1\n")
writeFileSync(
  join(tmp.dir, "secrets.config.json"),
  JSON.stringify({
    sources: [
      { provider: "dotenv", name: "base" },
      { provider: "dotenv", name: "extra", path: ".env.extra" },
    ],
  }),
)

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--no-env-file", CLI, ...args], {
    cwd: tmp.dir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "" },
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe("cli", () => {
  test("--version and help", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    expect(cli("--version")).toMatchObject({ code: 0, stdout: `${pkg.version}\n` })
    const help = cli()
    expect(help.code).toBe(0)
    expect(help.stdout).toContain("rinci-secrets run")
    expect(help.stdout).toContain("rsec")
  })

  test("providers lists every provider", () => {
    const { code, stdout } = cli("providers")
    expect(code).toBe(0)
    for (const name of [
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
    ]) {
      expect(stdout).toContain(name)
    }
  })

  test("list --json shows keys and owners, never values", () => {
    const { code, stdout } = cli("list", "--json")
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.keys).toEqual({ API_KEY: "base", EXTRA: "extra", QUOTE: "base" })
    expect(stdout).not.toContain("abc")
  })

  test("check reports each source and fails when one fails", () => {
    expect(cli("check")).toMatchObject({ code: 0 })
    const bad = join(tmp.dir, "bad.config.json")
    writeFileSync(bad, JSON.stringify({ sources: [{ provider: "dotenv", path: "missing.env" }] }))
    const result = cli("check", "-c", bad)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain("fail dotenv")
  })

  test("export formats", () => {
    expect(cli("export", "-q").stdout).toBe('API_KEY="abc"\nQUOTE="it\'s"\nEXTRA="1"\n')
    expect(JSON.parse(cli("export", "--format", "json", "-q").stdout)).toEqual({
      API_KEY: "abc",
      QUOTE: "it's",
      EXTRA: "1",
    })
    expect(cli("export", "--format", "shell", "-q", "-s", "base").stdout).toBe(
      "export API_KEY='abc'\nexport QUOTE='it'\\''s'\n",
    )
    expect(cli("export", "--format", "yaml").code).toBe(1)
  })

  test("run injects secrets and forwards the exit code", () => {
    const result = cli("run", "--", "node", "-e", "process.exit(process.env.API_KEY === 'abc' ? 42 : 1)")
    expect(result.code).toBe(42)
    expect(result.stderr).toContain("3 secrets")
  })

  test("run with --provider skips the config file", () => {
    const result = cli(
      "-p",
      "dotenv",
      "--set",
      "path=.env.extra",
      "--",
      "node",
      "-e",
      "process.exit(process.env.EXTRA === '1' && !process.env.API_KEY ? 0 : 1)",
    )
    expect(result.code).toBe(0)
  })

  test("a missing command exits 127", () => {
    expect(cli("run", "--", "definitely-not-a-command-xyz").code).toBe(127)
  })

  test("usage errors exit 1 with a hint", () => {
    const unknown = cli("bun", "dev")
    expect(unknown.code).toBe(1)
    expect(unknown.stderr).toContain("rinci-secrets run bun dev")
    expect(cli("run", "--nope").code).toBe(1)
    expect(cli("run").stderr).toContain("Nothing to run")
    expect(cli("list", "--set", "a=b").stderr).toContain("--set only applies with --provider")
    expect(cli("-p", "doppler", "--set", "token=x", "--", "node").stderr).toContain("looks like a credential")
  })

  test("init writes a template once", () => {
    const path = join(tmp.dir, "new.config.json")
    expect(cli("init", "doppler", "-c", path).code).toBe(0)
    expect(JSON.parse(readFileSync(path, "utf8")).sources[0].provider).toBe("doppler")
    const again = cli("init", "doppler", "-c", path)
    expect(again.code).toBe(1)
    expect(again.stderr).toContain("already exists")
    expect(cli("init", "doppler", "-c", path, "--force").code).toBe(0)
    expect(cli("init", "nope", "-c", join(tmp.dir, "x.json")).code).toBe(1)
    expect(existsSync(join(tmp.dir, "x.json"))).toBe(false)
  })
})
