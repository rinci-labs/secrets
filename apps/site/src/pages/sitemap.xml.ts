import type { APIRoute } from "astro"
import { docHref, getDocs } from "../lib/docs"

/** Written by hand from the docs collection, so a new page is listed without an integration. */
export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL("https://secrets.rin.ci")
  const paths = ["/", ...(await getDocs()).map(docHref)]
  const urls = paths.map((path) => `  <url><loc>${new URL(path, origin).href}</loc></url>`).join("\n")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  )
}
