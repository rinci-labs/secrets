import { type CollectionEntry, getCollection } from "astro:content"
import { type DocGroup, docGroups } from "../site"

export type Doc = CollectionEntry<"docs">

/** `index` is the docs home; `providers/index` is the providers overview. */
export function docSlug(doc: Doc): string {
  return doc.id.replace(/(^|\/)index$/, "")
}

export function docHref(doc: Doc): string {
  const slug = docSlug(doc)
  return slug ? `/docs/${slug}` : "/docs"
}

/** Every page in sidebar order: by group, then by `order`. */
export async function getDocs(): Promise<Doc[]> {
  const docs = await getCollection("docs")
  const rank = (group: DocGroup) => docGroups.indexOf(group)
  return docs.toSorted((a, b) => rank(a.data.group) - rank(b.data.group) || a.data.order - b.data.order)
}

export function groupDocs(docs: Doc[]): { group: DocGroup; docs: Doc[] }[] {
  return docGroups
    .map((group) => ({ group, docs: docs.filter((doc) => doc.data.group === group) }))
    .filter((g) => g.docs.length)
}
