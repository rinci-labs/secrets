---
title: CI and deploys
description: Use the same config in GitHub Actions, Docker and Cloudflare builds. Credentials from CI secrets, check before deploy, export only where a platform needs a file.
group: Guides
order: 2
---

In CI, set provider credentials as CI secrets and let the config do the rest. Variables already in the environment take precedence over `envFiles`, so the same config works on a laptop and in a pipeline.

## GitHub Actions

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      INFISICAL_CLIENT_ID: ${{ secrets.INFISICAL_CLIENT_ID }}
      INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx rinci-secrets check -e staging
      - run: bunx rinci-secrets run -e staging -- bun test
```

`check` fails the job early, with a readable reason, when a credential has expired or lost access.

## Docker

Keep secrets out of the image. Install the CLI and wrap the entrypoint, so values are fetched at start-up:

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production
ENTRYPOINT ["bunx", "rinci-secrets", "run", "-e", "prod", "--"]
CMD ["bun", "start"]
```

Pass the provider credentials at run time, for example `docker run -e DOPPLER_TOKEN ...`. They are removed from the app's environment before it starts.

## Platforms that need a file

Some platforms read env files or take bulk imports rather than running a wrapper. `export` prints the merged secrets. It refuses to print to a terminal, so redirect or pipe it:

```sh
rinci-secrets export -e prod > .env.production
rinci-secrets export -e prod --format json | some-cli secrets import
```

Formats: `dotenv` (default), `json`, `shell` (`export KEY='...'`) and `powershell` (`$env:KEY = '...'`).

Delete the file once the platform has it. A file on disk is the copy most likely to leak.

## Cloudflare Pages and Workers

Wrangler reads bulk secrets from JSON:

```sh
rinci-secrets export -e prod --format json | bunx wrangler secret bulk
```

For local `wrangler dev`, run it through the wrapper instead of writing `.dev.vars`:

```sh
rinci-secrets run -- bunx wrangler dev
```
