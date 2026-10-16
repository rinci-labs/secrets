import schema from "@rinci/secrets/schema.json"
import type { APIRoute } from "astro"

/** Serves the package's config schema at the URL configs point `$schema` at. */
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(schema, null, 2)}\n`, { headers: { "Content-Type": "application/schema+json" } })
