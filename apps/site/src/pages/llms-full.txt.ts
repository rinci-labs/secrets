import type { APIRoute } from "astro"
import { TEXT_HEADERS, buildLlmsFullTxt } from "../lib/llms"

/** Every docs page as one Markdown file, for a single agent fetch. */
export const GET: APIRoute = async () => new Response(await buildLlmsFullTxt(), { headers: { ...TEXT_HEADERS } })
