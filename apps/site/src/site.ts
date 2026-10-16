export const site = {
  name: "RINCI Secrets",
  short: "secrets",
  domain: "secrets.rin.ci",
  title: "RINCI Secrets - one entry point for every secrets manager",
  /** Kept under about 155 characters so search results show it whole. */
  description:
    "Run any command with secrets from Infisical, Doppler, Vault, AWS, GCP, Azure, 1Password, Bitwarden, SOPS or any CLI. One config, zero dependencies.",
  themeColor: "#0a0b0a",
  packageName: "@rinci/secrets",
  bin: "rinci-secrets",
  github: "https://github.com/rinci-labs/secrets",
  npm: "https://www.npmjs.com/package/@rinci/secrets",
  home: "https://rin.ci",
} as const

/** Docs sidebar groups, in order. Each page sets its group and order in frontmatter. */
export const docGroups = ["Start", "Guides", "Providers", "Reference"] as const
export type DocGroup = (typeof docGroups)[number]
