/**
 * Checks the built site the way a crawler and a link preview would: every
 * page has a title, description, canonical and a share card that exists at
 * 1200×630, and every internal link and asset resolves. Run after `build`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const DIST = fileURLToPath(new URL("../dist", import.meta.url))
const ORIGIN = "https://secrets.rin.ci"
const problems: string[] = []

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/** Maps a site path to the file Cloudflare Pages would serve for it. */
function served(path: string): string | undefined {
  const clean = decodeURIComponent(path.split(/[?#]/)[0] ?? "").replace(/\/$/, "")
  for (const candidate of [clean, `${clean}.html`, join(clean, "index.html")]) {
    const file = join(DIST, candidate || "index.html")
    if (existsSync(file) && !file.endsWith(DIST)) return file
  }
  return undefined
}

function pngSize(file: string): [number, number] {
  const png = readFileSync(file)
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

const attr = (html: string, pattern: RegExp) => html.match(pattern)?.[1]

const pages = walk(DIST).filter((f) => f.endsWith(".html"))
for (const file of pages) {
  const html = readFileSync(file, "utf8")
  const page = relative(DIST, file)
  const fail = (message: string) => problems.push(`${page}: ${message}`)
  const noindex = html.includes('name="robots" content="noindex"')

  if (!attr(html, /<title>([^<]+)<\/title>/)) fail("no <title>")
  if (!attr(html, /<meta name="description" content="([^"]+)"/)) fail("no description")
  if (!noindex && !attr(html, /<link rel="canonical" href="([^"]+)"/)) fail("no canonical")

  const image = attr(html, /<meta property="og:image" content="([^"]+)"/)
  if (!image) fail("no og:image")
  else if (!image.startsWith(ORIGIN)) fail(`og:image is not absolute on ${ORIGIN}: ${image}`)
  else {
    const png = served(image.slice(ORIGIN.length))
    if (!png) fail(`og:image ${image} was not built`)
    else if (pngSize(png).join("x") !== "1200x630") fail(`og:image ${image} is ${pngSize(png).join("x")}`)
  }
  if (!html.includes('name="twitter:card" content="summary_large_image"')) fail("no large twitter card")

  for (const [, ref] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (ref && !ref.startsWith("//") && !served(ref)) fail(`broken link ${ref}`)
  }
}

if (problems.length) {
  console.error(`${problems.length} problems in dist:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.info(`dist ok: ${pages.length} pages, every link, share card and tag in place`)
