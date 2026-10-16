import { SecretsError } from "../errors.js"
import { execText } from "./exec.js"
import { defineProvider, options, parsePayload } from "./types.js"

/**
 * Any secrets manager with a CLI: runs a command and reads its stdout as JSON
 * or dotenv. No shell is involved, so `args` reach the program as written.
 * The config is trusted to name the command, the same way it is trusted to
 * name where credentials are sent.
 */
export const command = defineProvider({
  name: "exec",
  description: "Any manager with a CLI: runs a command and reads JSON or dotenv from its output.",
  credentials: [],
  withhold: [],

  async load(raw, { env, cwd }) {
    const opt = options("exec", raw)
    const program = opt.string("command")
    if (!program) {
      throw new SecretsError('exec: "command" is required', {
        hint: 'e.g. "command": "esc", "args": ["env", "open", "org/app/dev", "--format", "dotenv"]',
      })
    }
    const args = opt.stringList("args") ?? []
    const text = await execText(program, args, {
      env,
      cwd,
      what: `exec ${program}`,
      install: `Install ${program}, or set "command" to its full path.`,
      timeoutMs: opt.number("timeoutMs", 30_000),
    })
    const key = opt.string("key")
    const format = opt.string("format") ?? (text.trimStart().startsWith("{") ? "json" : key ? "raw" : "dotenv")
    return parsePayload(format === "raw" ? text.replace(/\r?\n$/, "") : text, {
      format,
      key,
      label: `exec ${program} output`,
    })
  },
})
