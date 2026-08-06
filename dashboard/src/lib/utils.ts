/** Escape HTML special chars */
export function esc(s: unknown): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Format seconds-ago into human-readable string */
export function ageSince(secs: number): string {
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

/** Deterministic HSL hue from a project name */
export function projectHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return hash % 360
}

/** Format unix timestamp as locale time string */
export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString()
}

/** Copy text to clipboard */
export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
