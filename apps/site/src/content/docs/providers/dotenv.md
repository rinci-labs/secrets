---
title: .env files
label: dotenv
description: Local .env files as a source. For development, local overrides layered on a remote source, or an offline fallback.
group: Providers
order: 9
---

```json
{ "provider": "dotenv", "path": [".env", ".env.local"], "required": false }
```

Files are read in order, and later files win. Put this source last to let a developer override remote values locally, or mark a remote source `optional` and keep a file as the fallback.

## Options

| Option     | Default |                                                         |
| ---------- | ------- | ------------------------------------------------------- |
| `path`     | `.env`  | A path or a list of paths, relative to the config file. |
| `required` | `true`  | When `false`, missing files are skipped.                |

## Syntax

The common dotenv rules:

- `KEY=value`, `export KEY=value`, `#` comments and blank lines.
- Single quotes are literal. Double quotes expand `\n`, `\r`, `\t`, `\"` and `\\`.
- Quoted values can span lines. An unquoted value ends at `#`.
- No variable expansion. A value is exactly what the file says.

This is not the same as `envFiles`. A `dotenv` _source_ provides secrets to your command. `envFiles` provide _credentials_ to the other providers, and are never passed to the command.
