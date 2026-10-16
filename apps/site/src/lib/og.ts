import type { CardProps } from "../og/card"
import { site } from "../site"
import { type Doc, docHref } from "./docs"

export { OG_HEIGHT, OG_WIDTH } from "../og/size"

/** `/` → `/og/index.png`, `/docs/aws` → `/og/docs/aws.png`. */
export function ogPath(pathname: string): string {
  const path = pathname.replace(/\.html$/, "").replace(/^\/+|\/+$/g, "")
  return `/og/${path || "index"}.png`
}

export const homeCard: CardProps = {
  title: "Every secrets manager,",
  subtitle: "one command.",
  chip: `${site.bin} run -- bun dev`,
}

export function docCard(doc: Doc): CardProps {
  return {
    title: doc.data.title,
    subtitle: doc.data.description,
    chip: `${site.domain}${docHref(doc)}`,
    label: `Docs · ${doc.data.group}`,
  }
}
