import { listProviders } from "@secrets-src/providers/index.js"
import { TEMPLATES } from "@secrets-src/templates.js"
import { type Doc, docHref, getDocs } from "./docs"

export interface CatalogEntry {
  /** The provider name used in a config, e.g. `aws-ssm`. */
  name: string
  label: string
  summary: string
  href: string
  credentials: readonly string[]
  /** The config `init` writes, as formatted JSON. */
  config: string
  /** What to do after `init`, from the CLI's own templates. */
  next: string
}

/**
 * Every provider, joined with its `init` template and its docs page, in docs
 * order. Fails the build when one of the three is missing, so the landing
 * page, the docs and the CLI cannot disagree about what is supported.
 */
export async function getCatalog(): Promise<CatalogEntry[]> {
  const pages = new Map<string, Doc>(
    (await getDocs())
      .filter((doc) => doc.id.startsWith("providers/"))
      .map((doc) => [doc.id.slice("providers/".length), doc]),
  )
  const entries = listProviders().map((provider) => {
    const doc = pages.get(provider.name)
    const template = TEMPLATES[provider.name]
    if (!doc) throw new Error(`provider "${provider.name}" has no docs page at providers/${provider.name}.md`)
    if (!template) throw new Error(`provider "${provider.name}" has no init template`)
    return {
      doc,
      entry: {
        name: provider.name,
        label: doc.data.label ?? doc.data.title,
        summary: doc.data.description,
        href: docHref(doc),
        credentials: provider.credentials,
        config: JSON.stringify(template.config, null, 2),
        next: template.next,
      },
    }
  })
  return entries.toSorted((a, b) => a.doc.data.order - b.doc.data.order).map(({ entry }) => entry)
}
