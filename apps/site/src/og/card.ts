import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { LOGO_TEXT_RATIO, LOGO_TEXT_SVG } from "@rinci/brand"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { OG_HEIGHT, OG_WIDTH } from "./size"

const color = {
  ink: "#0a0b0a",
  ink2: "#101210",
  paper: "#f4f5f3",
  dim: "#9aa09a",
  faint: "#62675f",
  line: "#1e211e",
  signal: "#6fbf95",
}

export type CardProps = {
  /** First line, in paper. */
  title: string
  /** Second line, in dim. Short text continues the headline; long text becomes a paragraph. */
  subtitle: string
  /** Monospace text in the chip, e.g. a command or a URL path. */
  chip: string
  /** Small label top right, e.g. the docs section. */
  label?: string
}

type Style = Record<string, string | number>
interface Node {
  type: string
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown }
}
type Child = Node | string

const h = (type: string, style: Style, children?: Child | Child[], props: Record<string, unknown> = {}): Node => ({
  type,
  props: { ...props, style: { display: "flex", ...style }, children },
})

// Satori loads TTF/OTF only; the brand ships woff2, so the static cuts are vendored here.
const FONT_DIR = join(process.cwd(), "src/og/fonts")
let fonts: Promise<Parameters<typeof satori>[1]["fonts"]> | undefined
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(FONT_DIR, "Geist-Regular.ttf")),
    readFile(join(FONT_DIR, "Geist-Medium.ttf")),
    readFile(join(FONT_DIR, "GeistMono-Regular.ttf")),
  ]).then(([regular, medium, mono]) => [
    { name: "Geist", data: regular, weight: 400, style: "normal" },
    { name: "Geist", data: medium, weight: 500, style: "normal" },
    { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
  ])
  return fonts
}

const logo = `data:image/svg+xml;base64,${Buffer.from(LOGO_TEXT_SVG.replace("<path ", `<path fill="${color.paper}" `)).toString("base64")}`

/** Shortens at a word boundary, so a card never ends in half a word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`
}

function card({ title, subtitle, chip, label }: CardProps): Node {
  const headline = title.length > 30 ? 64 : 76
  const continues = subtitle.length <= 44

  return h(
    "div",
    {
      position: "relative",
      boxSizing: "border-box",
      width: OG_WIDTH,
      height: OG_HEIGHT,
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "72px 80px",
      backgroundColor: color.ink,
      // The glow first so it tints the grid beneath it.
      backgroundImage: [
        "radial-gradient(circle at 0% 0%, rgba(111, 191, 149, 0.20) 0%, rgba(111, 191, 149, 0.06) 40%, rgba(10, 11, 10, 0) 70%)",
        `linear-gradient(${color.line} 1px, rgba(0, 0, 0, 0) 1px)`,
        `linear-gradient(90deg, ${color.line} 1px, rgba(0, 0, 0, 0) 1px)`,
      ].join(", "),
      backgroundSize: `${OG_WIDTH}px ${OG_HEIGHT}px, 56px 56px, 56px 56px`,
      fontFamily: "Geist",
      color: color.paper,
    },
    [
      h("div", {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 4,
        backgroundImage: `linear-gradient(90deg, ${color.signal} 0%, rgba(111, 191, 149, 0.35) 55%, rgba(111, 191, 149, 0) 100%)`,
      }),

      h("div", { justifyContent: "space-between", alignItems: "center" }, [
        h("img", { width: 44 * LOGO_TEXT_RATIO, height: 44 }, undefined, {
          src: logo,
          width: 44 * LOGO_TEXT_RATIO,
          height: 44,
        }),
        h(
          "div",
          { fontFamily: "Geist Mono", fontSize: 22, color: color.dim, letterSpacing: "0.06em" },
          label ? clip(label, 40).toUpperCase() : "",
        ),
      ]),

      h("div", { flexDirection: "column", gap: continues ? 0 : 22, maxWidth: 1000 }, [
        h("div", { fontSize: headline, fontWeight: 500, lineHeight: 1.08, letterSpacing: "-0.035em" }, clip(title, 60)),
        h(
          "div",
          continues
            ? { fontSize: headline, fontWeight: 500, lineHeight: 1.08, letterSpacing: "-0.035em", color: color.dim }
            : { fontSize: 32, lineHeight: 1.4, color: color.dim, maxWidth: 960 },
          clip(subtitle, 150),
        ),
      ]),

      h(
        "div",
        {
          alignSelf: "flex-start",
          alignItems: "center",
          gap: 16,
          padding: "16px 24px",
          backgroundColor: color.ink2,
          border: `1px solid ${color.line}`,
          borderRadius: 10,
        },
        [
          h("div", { width: 14, height: 14, backgroundColor: color.signal }),
          h("div", { fontFamily: "Geist Mono", fontSize: 26, color: color.paper }, clip(chip, 56)),
        ],
      ),
    ],
  )
}

export async function renderCard(props: CardProps): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(card(props) as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await loadFonts(),
  })
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng())
}
