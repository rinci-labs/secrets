import { listProviders } from "@secrets-src/providers/index.js"
import { TEMPLATES } from "@secrets-src/templates.js"
import { site } from "../site"
import type { Doc } from "./docs"
import { docHref, docSlug, getDocs } from "./docs"

const ORIGIN = `https://${site.domain}`

/** Absolute URL for the Markdown twin of a docs page. */
export function docMarkdownHref(doc: Doc): string {
  const slug = docSlug(doc)
  return slug ? `${ORIGIN}/docs/${slug}.md` : `${ORIGIN}/docs.md`
}

export function docHtmlHref(doc: Doc): string {
  return `${ORIGIN}${docHref(doc)}`
}

const QUICK_START = `## How agents should use this

1. Install: \`bun add -d ${site.packageName}\` (or \`npm i -D ${site.packageName}\`). Bins: \`rinci-secrets\` and \`rsec\`.
2. Pick a provider from the list below. Run \`bunx rsec init <provider>\` to write \`secrets.config.json\`.
3. Put credentials in the environment or an \`envFiles\` entry (e.g. \`.env.infisical\`). Never put tokens in the config.
4. Run the app: \`bunx rsec run -- <command>\`. Secrets are injected into the child environment only; nothing is written to disk.
5. JSON Schema for editors and validation: ${ORIGIN}/schema.json
6. Prefer the \`.md\` URLs in this index over HTML when ingesting docs.

Rules agents must follow:
- Credentials stay out of \`secrets.config.json\` (keys named like token/password/clientSecret are rejected).
- Provider login vars are withheld from the child unless \`keepCredentials\` is set.
- Plain HTTP to non-private hosts is refused.
- Prefer \`rsec\` / \`rinci-secrets\` over rewriting secrets-fetch scripts.`

function providerLines(): string {
  return listProviders()
    .map((p) => {
      const template = TEMPLATES[p.name]
      const creds = p.credentials.length ? p.credentials.join(", ") : "(none)"
      const next = template ? ` Next: ${template.next}.` : ""
      return `- \`${p.name}\` - ${p.description} Credentials: ${creds}.${next}`
    })
    .join("\n")
}

/** Curated index at /llms.txt (llms.txt v1/v2). */
export async function buildLlmsTxt(): Promise<string> {
  const docs = await getDocs()
  const byGroup = (group: string) => docs.filter((d) => d.data.group === group)

  const section = (title: string, group: string) => {
    const items = byGroup(group)
    if (!items.length) return ""
    const links = items
      .map((d) => {
        const label = d.data.label ?? d.data.title
        return `- [${label}](${docMarkdownHref(d)}): ${d.data.description}`
      })
      .join("\n")
    return `## ${title}\n\n${links}\n`
  }

  return [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `\`${site.packageName}\` is a zero-dependency CLI and library. Alias: \`rsec\`. Site: ${ORIGIN}. npm: ${site.npm}. Source: ${site.github}.`,
    "",
    QUICK_START,
    "",
    "## Providers",
    "",
    providerLines(),
    "",
    section("Start", "Start"),
    section("Guides", "Guides"),
    section("Providers", "Providers"),
    section("Reference", "Reference"),
    "## Machine-readable",
    "",
    `- [JSON Schema](${ORIGIN}/schema.json): Validate \`secrets.config.json\`.`,
    `- [Full docs (llms-full.txt)](${ORIGIN}/llms-full.txt): Every docs page concatenated as Markdown.`,
    `- [Sitemap](${ORIGIN}/sitemap.xml)`,
    "",
    "## Optional",
    "",
    `- [For agents (HTML)](${ORIGIN}/docs/agents)`,
    `- [HTML docs home](${ORIGIN}/docs)`,
    `- [Landing page](${ORIGIN}/)`,
    `- [Security model](${ORIGIN}/docs/security.md)`,
    `- [GitHub repository](${site.github})`,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

/** One file with every docs page, for agents that want a single fetch. */
export async function buildLlmsFullTxt(): Promise<string> {
  const docs = await getDocs()
  const parts = [
    `# ${site.name} - full documentation`,
    "",
    `> ${site.description}`,
    "",
    `Package: \`${site.packageName}\` · Alias: \`rsec\` · ${ORIGIN}`,
    "",
    QUICK_START,
    "",
    "## Providers (built-in)",
    "",
    providerLines(),
    "",
    "---",
    "",
  ]

  for (const doc of docs) {
    const slug = docSlug(doc) || "index"
    parts.push(
      `# ${doc.data.title}`,
      "",
      `> ${doc.data.description}`,
      "",
      `Source: ${docMarkdownHref(doc)} · HTML: ${docHtmlHref(doc)} · id: \`${slug}\``,
      "",
      (doc.body ?? "").trim(),
      "",
      "---",
      "",
    )
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n")
}

/** Markdown twin body for a single docs page. */
export function buildDocMarkdown(doc: Doc): string {
  return [
    `# ${doc.data.title}`,
    "",
    `> ${doc.data.description}`,
    "",
    (doc.body ?? "").trim(),
    "",
    `---`,
    "",
    `HTML: ${docHtmlHref(doc)} · Index: ${ORIGIN}/llms.txt`,
    "",
  ].join("\n")
}

export const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
} as const
