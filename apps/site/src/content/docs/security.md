---
title: Security model
label: Security
description: What @rinci/secrets protects against, how, and where its responsibility ends. Credentials, transport, process spawning, failure modes and supply chain.
group: Reference
order: 1
---

The tool sits between a long-lived credential (a machine identity, a token) and the process that needs secrets. Its job is to read the secrets and hand them over without widening who can see either one.

## Guarantees

### Credentials never live in the config

The config is meant to be committed, so it describes _where_ secrets live, never how to log in. Source options named like `token`, `password`, `clientSecret` or `privateKey` are rejected. Credentials come from the process environment or from `envFiles`, which should be untracked.

### The app does not get the identity

Provider-only credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_TOKEN`, `DOPPLER_TOKEN`, `VAULT_TOKEN`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `OP_SERVICE_ACCOUNT_TOKEN`, `BWS_ACCESS_TOKEN`, `AZURE_KEYVAULT_TOKEN`) are removed from the child environment. `envFiles` contents are never added to it at all. A compromised dependency in your app can read the secrets it was given. It cannot read the identity that can fetch every other secret in the project.

General cloud credentials (`AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_CLIENT_*`) are left alone, because apps legitimately use them. Use `--pure` when you want the child to see nothing else.

### The config is one you chose

A config decides where credentials are sent, so the tool is careful about which one it reads. The search walks up from the current directory but stops at the repository root (the first directory with a `.git`) and at your home directory. A `secrets.config.json` planted in a parent directory, like a shared `/tmp` or another checkout, is never picked up. On macOS and Linux, a config owned by another user (other than root) or writable by everyone is refused. Credential files readable by other users get a `chmod 600` warning.

### Tokens are short-lived

When the tool logs in itself, with Infisical Universal Auth or Vault AppRole, it revokes the token it received as soon as the read finishes, whether the read succeeded or not. Google service account assertions are minted with a 10-minute lifetime.

### Transport

- HTTPS is required for public hosts. Plain HTTP is allowed only to loopback, RFC 1918, CGNAT (`100.64.0.0/10`, used by WARP and Tailscale), IPv6 ULA and link-local addresses, and `.local`, `.internal`, `.lan`, `.svc` and `.cluster.local` names. Anything else needs an explicit `"allowInsecure": true`.
- The check runs before any credential is sent.
- Redirects are refused, so a request with an `Authorization` header cannot be bounced to another host.
- Azure Key Vault pagination links are only followed within the same vault, and a `vault` must be a vault name or a bare `https://` origin, so it cannot point the token at another host.
- A Google credentials file's `token_uri` passes the same HTTPS check before a signed assertion is sent to it.
- Every request has a timeout. Idempotent reads retry twice, with backoff, on network errors, 429 and 5xx. Logins are not retried.

### No shell

Commands are spawned directly with an argument array. Arguments reach the program byte for byte, and nothing in a secret value or an argument is parsed as shell syntax. On Windows, `.cmd` and `.bat` files (npm and bun shims) can only run through `cmd.exe`. For those, every argument is quoted and its metacharacters escaped. The command is looked up on `PATH` only, never in the current directory, so a planted `bun.cmd` in a repo is not picked up.

Vendor CLIs (`op`, `bws`) are also run without a shell, with a timeout and an output size cap. Values passed to them as arguments, like an item name or a project ID, may not start with `-`, so a config cannot smuggle in a flag.

### Provider output is untrusted

Error responses and CLI error output are stripped of control characters before they are printed, so a hostile server cannot rewrite your terminal with escape sequences. Secret names that a process cannot hold (empty, containing `=`, a NUL or a control character, or `__proto__`) are dropped with a warning instead of being passed on.

### Fails closed

If any required source fails, nothing runs. There is no partial environment and no stale fallback. Mark a source `optional` to opt out, per source.

### Values stay out of logs and off disk

`run`, `list` and `check` print counts, names and timings, never values. Error messages include at most 300 characters of a provider's error response. Nothing is cached or written to disk. `export` is the only command that prints values, and it refuses to write to a terminal unless you pass `--force`.

## Supply chain

The package has **no runtime dependencies**. AWS Signature V4, the Google JWT exchange, the dotenv parser and the Windows argument escaping are all in the repository, built on `node:crypto`, `node:child_process` and `fetch`. Releases are published from CI with npm provenance, so a tarball can be traced to the commit that built it.

## Out of scope

- **A compromised machine.** Anything that can read the credential file or the process memory can read the secrets.
- **What the app does with secrets.** Once a value is in the child's environment, the child decides where it goes. That includes its child processes, crash reporters and logs.
- **Process listings.** Environment variables are visible to the same user (`/proc/<pid>/environ` on Linux) and to administrators. That is how every env-based tool works.
- **Over-broad identities.** Scope machine identities to the environments and paths an app needs. The tool reads whatever the identity can read.

## Reporting a vulnerability

Email **hello@rin.ci** with "security" in the subject, details and a way to reproduce. Please do not open a public issue for security reports.
