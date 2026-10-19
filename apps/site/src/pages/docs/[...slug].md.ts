import type { APIRoute, GetStaticPaths } from "astro"
import { type Doc, getDocs, docSlug } from "../../lib/docs"
import { TEXT_HEADERS, buildDocMarkdown } from "../../lib/llms"

export const getStaticPaths = (async () => {
  const docs = await getDocs()
  return docs
    .filter((doc) => docSlug(doc))
    .map((doc) => ({
      params: { slug: docSlug(doc) },
      props: { doc },
    }))
}) satisfies GetStaticPaths

/** Markdown twin of each /docs/* HTML page. */
export const GET: APIRoute = async ({ props }) => {
  const { doc } = props as { doc: Doc }
  return new Response(buildDocMarkdown(doc), { headers: { ...TEXT_HEADERS } })
}
