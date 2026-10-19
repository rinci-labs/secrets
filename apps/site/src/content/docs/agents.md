---
title: For agents
description: Machine-readable docs and the shortest path for an LLM or coding agent to wire @rinci/secrets into a project.
group: Start
order: 3
label: Agents
---

Coding agents should prefer the public text endpoints over scraping HTML.

## Fetch these first

| URL                                                      | What it is                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| [`/llms.txt`](https://secrets.rin.ci/llms.txt)           | Curated index: install steps, every provider, links to Markdown docs |
| [`/llms-full.txt`](https://secrets.rin.ci/llms-full.txt) | The same docs as one Markdown file (~60 KB)                          |
| [`/schema.json`](https://secrets.rin.ci/schema.json)     | JSON Schema for `secrets.config.json`                                |
| [`/docs.md`](https://secrets.rin.ci/docs.md)             | Markdown twin of Getting started                                     |

Every HTML docs page has a Markdown twin at the same path with a `.md` suffix, for example [`/docs/cli.md`](https://secrets.rin.ci/docs/cli.md) and [`/docs/providers/infisical.md`](https://secrets.rin.ci/docs/providers/infisical.md).

## Implement in five steps

1. Install: `bun add -d @rinci/secrets` (or `npm i -D @rinci/secrets`). Bins: `rinci-secrets` and `rsec`.
2. Pick a provider from [`/llms.txt`](https://secrets.rin.ci/llms.txt) or [`providers`](/docs/providers).
3. Write the config: `bunx rsec init <provider>`.
4. Put credentials in the environment or an `envFiles` entry. Never put tokens in the config.
5. Run: `bunx rsec run -- <command>`.

```sh
bun add -d @rinci/secrets
bunx rsec init doppler
# put DOPPLER_TOKEN in .env.doppler
bunx rsec run -- bun dev
```

## Rules agents must follow

- Credentials stay out of `secrets.config.json`. Keys that look like `token`, `password`, or `clientSecret` are rejected.
- Provider login variables are withheld from the child process unless `keepCredentials` is set.
- Plain HTTP to non-private hosts is refused.
- Prefer `rsec` / `rinci-secrets` over inventing a one-off secrets-fetch script.

## Library use

```ts
import { loadSecrets, runWithSecrets } from "@rinci/secrets"

const { secrets } = await loadSecrets({ environment: "prod" })
const { code } = await runWithSecrets("bun", ["dev"])
```

See the [library reference](/docs/library) for options and return shapes.

## Discovery on every page

HTML pages advertise the agent index with:

```html
<link rel="describedby" href="/llms.txt" /> <link rel="alternate" type="text/markdown" href="/docs/….md" />
```
