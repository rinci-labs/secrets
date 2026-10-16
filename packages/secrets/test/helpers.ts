import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface Call {
  method: string
  url: URL
  headers: Headers
  body: string | undefined
  redirect: RequestInit["redirect"]
}

type Reply = Response | Record<string, unknown> | unknown[] | ((call: Call) => unknown)

/**
 * A fetch stand-in keyed by "METHOD /path". Plain values become JSON; return a
 * Response for status codes. Records every call for assertions.
 */
export function mockFetch(routes: Record<string, Reply>) {
  const calls: Call[] = []
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const call: Call = {
      method: init.method ?? "GET",
      url,
      headers: new Headers(init.headers),
      body: init.body as string | undefined,
      redirect: init.redirect,
    }
    calls.push(call)
    const route = routes[`${call.method} ${url.pathname}`]
    if (route === undefined) return new Response(`no route for ${call.method} ${url.pathname}`, { status: 404 })
    const reply = typeof route === "function" ? route(call) : route
    return reply instanceof Response ? reply : Response.json(reply)
  }) as typeof fetch
  return { fn, calls, paths: () => calls.map((c) => `${c.method} ${c.url.pathname}`) }
}

export function tempDir(prefix = "rinci-secrets-") {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * Writes an executable named `name` into `dir` that runs a small Node script:
 * it records its arguments to `<name>.args.json`, prints `stdout`, writes
 * `stderr` and exits with `code`. A `.cmd` on Windows, a shell script elsewhere.
 */
export function fakeCli(dir: string, name: string, { stdout = "", stderr = "", code = 0 } = {}): string {
  // Providers spawn with the test's env, which has no PATH, so node is named absolutely.
  const node = Bun.which("node")
  if (!node) throw new Error("the CLI tests need node on PATH")
  const script = join(dir, `${name}.mjs`)
  writeFileSync(
    script,
    [
      `import { writeFileSync } from "node:fs"`,
      `writeFileSync(${JSON.stringify(join(dir, `${name}.args.json`))}, JSON.stringify(process.argv.slice(2)))`,
      `process.stdout.write(${JSON.stringify(stdout)})`,
      `process.stderr.write(${JSON.stringify(stderr)})`,
      `process.exit(${code})`,
    ].join("\n"),
  )
  if (process.platform === "win32") {
    const path = join(dir, `${name}.cmd`)
    writeFileSync(path, `@"${node}" "${script}" %*\r\n`)
    return path
  }
  const path = join(dir, name)
  writeFileSync(path, `#!/bin/sh\nexec "${node}" "${script}" "$@"\n`)
  chmodSync(path, 0o755)
  return path
}
