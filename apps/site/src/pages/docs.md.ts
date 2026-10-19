import type { APIRoute } from "astro"
import { getDocs, docSlug } from "../lib/docs"
import { TEXT_HEADERS, buildDocMarkdown } from "../lib/llms"

/** Markdown twin of /docs (getting started). */
export const GET: APIRoute = async () => {
  const home = (await getDocs()).find((d) => !docSlug(d))
  if (!home) return new Response("Not found", { status: 404 })
  return new Response(buildDocMarkdown(home), { headers: { ...TEXT_HEADERS } })
}
