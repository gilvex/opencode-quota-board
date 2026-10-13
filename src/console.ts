import type { AuthEntry, Quota } from "./legacy-types.js"

export async function fetchConsole(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  if (auth.type === "wellknown") throw new Error("OpenCode Console requires a connected account")
  const server = new URL(auth.consoleServer ?? "https://opencode.ai/console")
  if (!["https:", "http:"].includes(server.protocol)) throw new Error("OpenCode Console server URL invalid")
  const base = `${server.origin}${server.pathname.replace(/\/+$/, "")}`
  const headers = {
    Accept: "application/json", Authorization: `Bearer ${auth.type === "oauth" ? auth.access : auth.key}`,
    ...(auth.orgID ? { "x-org-id": auth.orgID } : {}),
  }
  const get = async (path: string): Promise<unknown> => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const response = await fetch(`${base}${path}`, { headers, redirect: "error", signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    if (!response.ok) {
      const { UsageError } = await import("./adapters.js")
      throw new UsageError(response.status, response.headers.get("retry-after"))
    }
    return response.json()
  }
  // Member subscription access and admin billing access can differ.
  const results = await Promise.allSettled([
    get("/api/billing/status").then(parseBilling),
    get("/api/go/status").then(parseSubscription),
  ])
  const quotas = results.flatMap(result => result.status === "fulfilled" ? result.value : [])
  if (quotas.length) return quotas
  const failure = results.find(result => result.status === "rejected")
  if (failure?.status === "rejected") throw failure.reason
  throw new Error("OpenCode Console has no active subscription or readable credit balance")
}

/** API microcents are decimal strings: 100,000,000 = one USD. */
function microcents(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+$/.test(value))) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
export function parseBilling(value: unknown): Quota[] {
  const data = record(value)
  if (!data) throw new Error("invalid usage response from Console billing")
  const amount = microcents(data.mode === "credit" ? data.availableMicroCents : data.balanceMicroCents)
  if (amount === undefined) throw new Error("credit balance not returned")
  return [{ kind: "credit", label: data.mode === "credit" ? "available credit" : "credits", remaining: amount / 100_000_000, currency: "USD" }]
}
export function parseSubscription(value: unknown): Quota[] {
  if (value === null) return []
  const data = record(value)
  if (data?.access === null) return []
  const meters = record(record(data?.access)?.meters)
  if (!meters) throw new Error("invalid usage response from Console subscription")
  const product = data?.product === "go-plus" ? "Go Plus" : "Go"
  return [["fiveHour", "5h"], ["week", "weekly"], ["month", "monthly"]].flatMap(([key, label]): Quota[] => {
    const meter = record(meters[key])
    const limit = microcents(meter?.limitMicroCents)
    const used = microcents(meter?.usedMicroCents)
    if (limit === undefined || used === undefined || limit <= 0) return []
    const reset = typeof meter?.resetsAt === "string" ? new Date(meter.resetsAt) : undefined
    return [{ kind: "percentage", label: `${product} ${label}`, remainingPercent: Math.max(0, Math.min(100, 100 * (1 - used / limit))), resetsAt: reset && Number.isFinite(reset.getTime()) ? reset : undefined }]
  })
}
