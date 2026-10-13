import type { Quota, Row } from "./rpc.js"

export function summary(row: Row, compact = false, now = Date.now()) {
  const quota = [...row.quotas].filter(q => q.kind === "percentage").sort((a, b) => a.remaining - b.remaining)[0] ?? row.quotas[0]
  if (!quota) return row.status === "loading" ? "loading…" : row.status === "unsupported" ? "unavailable" : "needs attention"
  if (!compact) return `${quota.label} ${amount(quota)}`
  const reset = quota.kind === "percentage" ? resetLabel(quota.resetsAt, now).replace(/^resets /, "") : ""
  return `${amount(quota)}${reset ? ` · ${reset}` : ""}`
}
export function amount(q: Quota) {
  return q.kind === "percentage" ? `${Math.round(q.remaining)}%` : `${q.currency === "USD" ? "$" : ""}${q.remaining.toFixed(2)}${q.currency && q.currency !== "USD" ? ` ${q.currency}` : ""}`
}
export function resetLabel(at: number | undefined, now: number) {
  if (!at) return ""
  if (at <= now) return "reset pending refresh"
  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes >= 1440) return `resets ${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`
  return minutes >= 60 ? `resets ${Math.floor(minutes / 60)}h ${minutes % 60}m` : `resets ${minutes}m`
}
export function age(at: number | undefined, now: number) {
  if (!at) return "not fetched"
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  return minutes ? `updated ${minutes}m ago` : "updated just now"
}
export function bar(percent: number, width = 16) {
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 100 * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}
