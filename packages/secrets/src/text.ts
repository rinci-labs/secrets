// C0 and C1 control characters, including ESC: enough to rewrite a terminal.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g

export function hasControlChars(text: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/.test(text)
}

/**
 * Makes untrusted text (provider error bodies, CLI stderr) safe to print:
 * control characters become spaces, whitespace collapses, length is capped.
 */
export function sanitize(text: string, max = 300): string {
  const clean = text.replace(CONTROL, " ").replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}
