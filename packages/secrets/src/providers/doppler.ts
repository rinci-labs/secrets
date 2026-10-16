import { SecretsError } from "../errors.js"
import { assertSecureUrl, requestJson, trimSlash } from "../http.js"
import { defineProvider, flatten, options } from "./types.js"

/** Doppler. A service token is scoped to one config, so project and config are optional with one. */
export const doppler = defineProvider({
  name: "doppler",
  description: "Doppler via a service token or personal token.",
  credentials: ["DOPPLER_TOKEN"],
  withhold: ["DOPPLER_TOKEN"],

  async load(raw, { env, fetch }) {
    const opt = options("doppler", raw)
    const token = env.DOPPLER_TOKEN
    if (!token) throw new SecretsError("doppler: no credentials", { hint: "Set DOPPLER_TOKEN to a service token." })
    const host = trimSlash(opt.string("apiHost") ?? env.DOPPLER_API_HOST ?? "https://api.doppler.com")
    assertSecureUrl(host, { allowInsecure: opt.boolean("allowInsecure"), what: "doppler apiHost" })

    const query = new URLSearchParams({ format: "json" })
    const project = opt.string("project")
    const config = opt.string("config")
    if (project) query.set("project", project)
    if (config) query.set("config", config)

    const values = await requestJson<Record<string, unknown>>(`${host}/v3/configs/config/secrets/download?${query}`, {
      what: `Doppler read${config ? ` (${config})` : ""}`,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      timeoutMs: opt.number("timeoutMs", 15_000),
      retries: 2,
      fetch,
    })
    return flatten(values)
  },
})
