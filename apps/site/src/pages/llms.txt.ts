import type { APIRoute } from "astro"
import { TEXT_HEADERS, buildLlmsTxt } from "../lib/llms"

/** https://llmstxt.org — curated index for agents. */
export const GET: APIRoute = async () => new Response(await buildLlmsTxt(), { headers: { ...TEXT_HEADERS } })
