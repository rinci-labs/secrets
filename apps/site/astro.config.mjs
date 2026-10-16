// @ts-check
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import { rinciTheme } from "./src/shiki-theme.mjs"

// Static output for Cloudflare Pages: plain HTML, no server, and the only
// JavaScript shipped is the brand's ASCII field, pixel logo and copy buttons.
export default defineConfig({
  site: "https://secrets.rin.ci",
  trailingSlash: "never",
  build: { format: "file" },
  vite: { plugins: [tailwindcss()] },
  markdown: {
    shikiConfig: { theme: rinciTheme, wrap: false },
  },
  security: {
    // Astro hashes every script and <style> it renders into a CSP <meta>.
    // Inline style attributes (the pixel logo's mask, Shiki's token colours)
    // are allowed on their own directive: they cannot run code, and hashes
    // would otherwise switch them off.
    csp: {
      algorithm: "SHA-256",
      scriptDirective: { resources: ["'self'"] },
      styleDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "attribute" },
        ],
      },
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
    },
  },
})
