import { fetchConsole } from "./console.js"

import type { AuthEntry, CreditQuota, PercentageQuota, Quota } from "./legacy-types.js"

export const adapters: Record<string, (auth: AuthEntry, timeoutMs: number, signal?: AbortSignal) => Promise<Quota[]>> = {
  anthropic: fetchAnthropic,
  minimax: fetchMiniMax,
  "minimax-coding-plan": fetchMiniMax,
  "minimax-token-plan": fetchMiniMax,
  openai: fetchOpenAI,
  opencode: fetchConsole,
  openrouter: fetchOpenRouter,
  synthetic: fetchSynthetic,
  zai: fetchZai,
  "zai-coding-plan": fetchZai,
}

function credential(auth: AuthEntry) {
  if (auth.type === "oauth") return auth.access
  if (auth.type === "api") return auth.key
  return auth.token
}

async function fetchOpenAI(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  if (auth.type !== "oauth") throw new Error("subscription usage requires OAuth")
  const payload = await fetchJson(
    "https://chatgpt.com/backend-api/wham/usage",
    auth.access,
    timeoutMs,
    auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {},
    true, signal,
  )
  const rateLimit = recordAt(payload, "rate_limit")
  return [
    percentageFromUsed(recordAt(rateLimit, "primary_window"), "5h"),
    percentageFromUsed(recordAt(rateLimit, "secondary_window"), "weekly"),
  ].filter(notNull)
}

async function fetchAnthropic(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  if (auth.type !== "oauth") throw new Error("subscription usage requires OAuth")
  const payload = await fetchJson("https://api.anthropic.com/api/oauth/usage", auth.access, timeoutMs, {
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": "claude-code/2.1.0",
  }, true, signal)
  const quotas: Quota[] = [
    percentageFromUtilization(recordAt(payload, "five_hour"), "5h"),
    percentageFromUtilization(recordAt(payload, "seven_day"), "weekly"),
  ].filter(notNull)
  const extra = recordAt(payload, "extra_usage")
  const limit = numberAt(extra, "monthly_limit")
  const used = numberAt(extra, "used_credits")
  if (limit !== undefined && used !== undefined) {
    quotas.push({ kind: "credit", label: "extra", remaining: Math.max(0, limit - used), currency: stringAt(extra, "currency") })
  }
  return quotas
}

async function fetchOpenRouter(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  const payload = await fetchJson("https://openrouter.ai/api/v1/key", credential(auth), timeoutMs, {}, true, signal)
  const data = recordAt(payload, "data")
  const remaining = numberAt(data, "limit_remaining")
  if (remaining !== undefined) return [credit("key allowance", remaining, "USD")]
  const limit = numberAt(data, "limit")
  const usage = numberAt(data, "usage")
  if (limit !== undefined && usage !== undefined) return [credit("key allowance", Math.max(0, limit - usage), "USD")]
  throw new Error("credit balance not returned")
}

async function fetchZai(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  const payload = await fetchJson(
    "https://api.z.ai/api/monitor/usage/quota/limit",
    credential(auth),
    timeoutMs,
    {},
    false,
    signal,
  )
  const data = recordAt(payload, "data")
  const limits = Array.isArray(data?.limits) ? data.limits : []
  return limits
    .filter(isRecord)
    .filter((item) => item.type === "TOKENS_LIMIT")
    .map((item) => {
      const used = numberAt(item, "percentage")
      if (used === undefined) return null
      return percentage("5h", 100 - used, dateFromUnknown(item.nextResetTime))
    })
    .filter(notNull)
}

async function fetchSynthetic(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  const payload = await fetchJson("https://api.synthetic.new/v2/quotas", credential(auth), timeoutMs, {}, true, signal)
  const rolling = recordAt(payload, "rollingFiveHourLimit")
  const weekly = recordAt(payload, "weeklyTokenLimit")
  const quotas: Array<PercentageQuota | null> = []
  const remaining = numberAt(rolling, "remaining")
  const max = numberAt(rolling, "max")
  if (remaining !== undefined && max !== undefined && max > 0) {
    quotas.push(percentage("5h", (remaining / max) * 100, dateFromUnknown(rolling?.nextTickAt)))
  }
  const weeklyRemaining = numberAt(weekly, "percentRemaining")
  if (weeklyRemaining !== undefined) {
    quotas.push(percentage("weekly", weeklyRemaining, dateFromUnknown(weekly?.nextRegenAt)))
  }
  return quotas.filter(notNull)
}

async function fetchMiniMax(auth: AuthEntry, timeoutMs: number, signal?: AbortSignal): Promise<Quota[]> {
  const payload = await fetchJson("https://www.minimax.io/v1/token_plan/remains", credential(auth), timeoutMs, {}, true, signal)
  const entries = Array.isArray(payload.model_remains) ? payload.model_remains.filter(isRecord) : []
  const selected = entries.find((item) => item.model_name === "general") ?? entries[0]
  if (!selected) return []
  const quotas: Array<PercentageQuota | null> = []
  const fiveHour = numberAt(selected, "current_interval_remaining_percent")
  if (fiveHour !== undefined && selected.current_interval_status !== 3) {
    quotas.push(percentage("5h", fiveHour, dateAfter(numberAt(selected, "remains_time"))))
  }
  const weekly = numberAt(selected, "current_weekly_remaining_percent")
  if (weekly !== undefined && selected.current_weekly_status !== 3) {
    quotas.push(percentage("weekly", weekly, dateAfter(numberAt(selected, "weekly_remains_time"))))
  }
  return quotas.filter(notNull)
}

async function fetchJson(
  url: string,
  token: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
  bearer = true,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: bearer ? `Bearer ${token}` : token,
      ...headers,
    },
    redirect: "error",
    signal: requestSignal(timeoutMs, signal),
  })
  if (!response.ok) throw new UsageError(response.status, response.headers.get("retry-after"))
  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error("invalid usage response")
  return payload
}

function percentageFromUsed(value: Record<string, unknown> | undefined, fallback: string): PercentageQuota | null {
  const used = numberAt(value, "used_percent")
  if (used === undefined) return null
  const windowSeconds = numberAt(value, "limit_window_seconds")
  const label = windowSeconds ? durationLabel(windowSeconds) : fallback
  const resetAt = numberAt(value, "reset_at")
  const resetAfter = numberAt(value, "reset_after_seconds")
  return percentage(label, 100 - used, resetAt ? new Date(resetAt * 1000) : dateAfter(resetAfter, 1000))
}

function percentageFromUtilization(value: Record<string, unknown> | undefined, label: string): PercentageQuota | null {
  const utilization = numberAt(value, "utilization")
  if (utilization === undefined) return null
  return percentage(label, 100 - utilization, dateFromUnknown(value?.resets_at))
}

function percentage(label: string, remainingPercent: number, resetsAt?: Date): PercentageQuota {
  return { kind: "percentage", label, remainingPercent: clamp(remainingPercent), resetsAt }
}

function credit(label: string, remaining: number, currency?: string): CreditQuota {
  return { kind: "credit", label, remaining, currency }
}

function durationLabel(seconds: number) {
  if (seconds % 604800 === 0) return `${seconds / 604800}w`
  if (seconds % 86400 === 0) return `${seconds / 86400}d`
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  return "usage"
}

function dateAfter(value: number | undefined, multiplier = 1) {
  return value === undefined ? undefined : new Date(Date.now() + value * multiplier)
}

function dateFromUnknown(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function recordAt(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] : undefined
}

function numberAt(value: unknown, key: string) {
  const item = isRecord(value) ? value[key] : undefined
  return typeof item === "number" && Number.isFinite(item) ? item : undefined
}

function stringAt(value: unknown, key: string) {
  const item = isRecord(value) ? value[key] : undefined
  return typeof item === "string" ? item : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function notNull<T>(value: T | null): value is T {
  return value !== null
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function safeError(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "usage request timed out"
  if (error instanceof Error && /^(subscription usage|credit balance|no quota|usage request|invalid usage|need creds|OpenCode)/.test(error.message)) {
    return error.message
  }
  return "usage unavailable"
}

export const testing = { durationLabel, percentageFromUsed, percentageFromUtilization }

function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
}

export class UsageError extends Error {
  readonly retryAt?: number
  constructor(readonly status: number, retryAfter: string | null) {
    super(status === 401 || status === 403 ? "usage request requires sign-in or additional access" : `usage request failed (HTTP ${status})`)
    if (retryAfter) {
      const seconds = Number(retryAfter)
      const value = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter)
      if (Number.isFinite(value)) this.retryAt = value
    }
  }
}
