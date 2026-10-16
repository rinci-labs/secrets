---
title: CLI reference
label: CLI
description: Every rinci-secrets command and option. run, list, check, export, init and providers, with exit codes and output conventions.
group: Reference
order: 2
---

```
rinci-secrets <command> [options] [--] [command to run...]
```

`rsec` is the same command under a shorter name: `rsec run -- bun dev` works everywhere `rinci-secrets run -- bun dev` does.

Options before the command to run imply `run`, so `rinci-secrets -e prod -- bun start` is `rinci-secrets run -e prod -- bun start`. With no arguments at all, it prints the help.

Logs go to **stderr** and data goes to **stdout**, so the output of `export` and `list --json` can be piped safely.

## Commands

### run

```sh
rinci-secrets run [options] [--] <command> [args...]
```

Loads secrets and runs the command with them in its environment. Options come first. Everything from `--`, or from the first argument that is not an option, belongs to the command. In `run -e prod bun dev --port 3000`, bun receives `--port 3000`.

The exit code is the command's own. If the command is killed by a signal, the exit code is 128 plus the signal number. Ctrl+C reaches the command directly, and the CLI waits for it to finish shutting down. SIGTERM and SIGHUP sent to the CLI are forwarded. On Windows the process tree is ended.

### list

```sh
rinci-secrets list [options] [--json]
```

Shows the keys each source returned, and which source wins each key. No values. `--json` prints `{ sources, keys }`, where `keys` maps each key to the source that set it.

### check

```sh
rinci-secrets check [options]
```

Reads every source separately and reports `ok` or `fail` with a reason and a hint. Exits 1 if any source failed. No values are printed.

### export

```sh
rinci-secrets export [options] [--format dotenv|json|shell|powershell] > file
```

Prints the merged secrets. It refuses to write to a terminal unless you pass `--force`. `shell` and `powershell` skip keys that are not valid variable names, and warn about each one.

### init

```sh
rinci-secrets init [provider] [--force] [--config path]
```

Writes a starter config for `infisical`, `doppler`, `vault`, `aws`, `gcp`, `azure`, `1password`, `bitwarden` or `dotenv`. It will not overwrite an existing file without `--force`.

### providers

Lists the supported providers and the environment variables each one reads credentials from.

## Options

| Option                  | Meaning                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `-c, --config <path>`   | Use this config instead of searching for `secrets.config.json`.       |
| `-e, --env <name>`      | Set `${SECRETS_ENV}` for interpolation.                               |
| `-s, --source <name>`   | Only read this source. Repeatable.                                    |
| `--env-file <path>`     | Load credentials from this file. Repeatable, and the file must exist. |
| `-p, --provider <name>` | Skip the config file and read from one provider.                      |
| `--set <key=value>`     | An option for `--provider`. Repeatable.                               |
| `--pure`                | Start the command from a minimal environment.                         |
| `--no-override`         | Keep variables that are already set.                                  |
| `--keep-credentials`    | Pass provider credentials through to the command.                     |
| `--format <name>`       | Output format for `export`.                                           |
| `--json`                | Machine-readable output for `list`.                                   |
| `--force`               | Let `export` print to a terminal, or `init` overwrite.                |
| `-q, --quiet`           | Only print errors.                                                    |
| `-v, --verbose`         | Also print key names, files read and credentials withheld.            |
| `-h, --help`            | Show help.                                                            |
| `-V, --version`         | Show the version.                                                     |

Options take their value as the next argument or after `=`: `--env prod` and `--env=prod` are the same.

## Exit codes

| Code  | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| `0`   | Success, or the command exited 0.                        |
| `1`   | A config, credential or provider error. Nothing was run. |
| `126` | The command was found but could not be started.          |
| `127` | The command was not found.                               |
| other | The command's own exit code.                             |

## Environment

| Variable      | Effect                                                   |
| ------------- | -------------------------------------------------------- |
| `SECRETS_ENV` | The default for `${SECRETS_ENV}` when `-e` is not given. |
| `NO_COLOR`    | Disable colours.                                         |
| `FORCE_COLOR` | Force colours on (`0` forces them off).                  |
