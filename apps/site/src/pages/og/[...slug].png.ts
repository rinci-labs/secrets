import type { APIRoute, GetStaticPaths } from "astro"
import { docHref, getDocs } from "../../lib/docs"
import { docCard, homeCard, ogPath } from "../../lib/og"
import { type CardProps, renderCard } from "../../og/card"

/** One 1200×630 card per page, rendered at build time. */
export const getStaticPaths = (async () => {
  const docs = await getDocs()
  const slug = (pathname: string) => ogPath(pathname).slice("/og/".length, -".png".length)
  return [
    { params: { slug: slug("/") }, props: homeCard },
    ...docs.map((doc) => ({ params: { slug: slug(docHref(doc)) }, props: docCard(doc) })),
  ]
}) satisfies GetStaticPaths

export const GET: APIRoute<CardProps> = async ({ props }) =>
  new Response(await renderCard(props), {
    headers: { "Content-Type": "image/png" },
  })
