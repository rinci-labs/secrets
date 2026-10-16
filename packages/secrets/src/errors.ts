/** An expected failure: bad config, missing credentials, a provider refusing. Printed without a stack. */
export class SecretsError extends Error {
  override name = "SecretsError"
  /** One line telling the user what to do next. */
  readonly hint: string | undefined
  /** Process exit code for the CLI: 1 by default, 127 when the command was not found. */
  readonly exitCode: number

  constructor(message: string, options: { hint?: string | undefined; exitCode?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.hint = options.hint
    this.exitCode = options.exitCode ?? 1
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
