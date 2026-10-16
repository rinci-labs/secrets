import { resolve } from "node:path"
import { readDotenv } from "../dotenv.js"
import { defineProvider, options } from "./types.js"

/** Local .env files, in order, later files winning. For development and as an offline fallback. */
export const dotenv = defineProvider({
  name: "dotenv",
  description: "Local .env files, merged in order.",
  credentials: [],
  withhold: [],

  async load(raw, { cwd }) {
    const opt = options("dotenv", raw)
    const paths = opt.stringList("path") ?? [".env"]
    const required = opt.boolean("required", true)
    const files = await Promise.all(paths.map((path) => readDotenv(resolve(cwd, path), { required })))
    return Object.assign({}, ...files)
  },
})
