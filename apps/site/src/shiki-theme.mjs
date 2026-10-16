// Code highlighting in the brand palette: paper text on ink, the signal green
// for strings and keys, greys for structure. Muted on purpose, like the brand.
const ink = "#101210"
const paper = "#f4f5f3"
const dim = "#9aa09a"
const faint = "#62675f"
const signal = "#6fbf95"
const sand = "#d8c99b"

/** @type {Exclude<import("astro").ShikiConfig["theme"], string>} */
export const rinciTheme = {
  name: "rinci",
  type: "dark",
  colors: { "editor.background": ink, "editor.foreground": paper },
  tokenColors: [
    { settings: { foreground: paper } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: faint, fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "markup.inline.raw"], settings: { foreground: signal } },
    {
      scope: ["support.type.property-name", "meta.object-literal.key", "entity.name.tag", "variable.other.env"],
      settings: { foreground: sand },
    },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new"],
      settings: { foreground: dim },
    },
    { scope: ["constant.numeric", "constant.language", "support.constant"], settings: { foreground: sand } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: paper } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: faint } },
    { scope: ["variable.parameter", "variable.other.option", "constant.other.option"], settings: { foreground: dim } },
  ],
}
