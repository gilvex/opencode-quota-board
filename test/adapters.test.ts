import { afterEach, describe, expect, it, vi } from "vitest"
import { adapters } from "../src/adapters.js"
import { parseBilling, parseSubscription } from "../src/console.js"

afterEach(() => vi.unstubAllGlobals())
describe("provider adapters", () => {
  it("normalizes OpenAI windows and sends the account identifier", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rate_limit: {
      primary_window: { used_percent: 37, limit_window_seconds: 18000, reset_at: 2000000000 },
      secondary_window: { used_percent: 72, limit_window_seconds: 604800 },
    } })))
    vi.stubGlobal("fetch", fetch)
    expect(await adapters.openai({ type: "oauth", access: "test-token", accountId: "test-account" }, 1000)).toMatchObject([
      { remainingPercent: 63, label: "5h" }, { remainingPercent: 28, label: "1w" },
    ])
    expect(fetch.mock.calls[0][1].headers["ChatGPT-Account-Id"]).toBe("test-account")
  })
  it("labels OpenRouter key allowances correctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { limit_remaining: 12.4 } }))))
    expect(await adapters.openrouter({ type: "api", key: "test" }, 1000)).toEqual([{ kind: "credit", label: "key allowance", remaining: 12.4, currency: "USD" }])
  })
  it("reads Console billing via the active OAuth token and workspace, without cookies", async () => {
    const fetch = vi.fn(async (url: string) => Response.json(url.endsWith("/billing/status")
      ? { mode: "prepaid", balanceMicroCents: "1250000000", availableMicroCents: "1250000000" }
      : null))
    vi.stubGlobal("fetch", fetch)
    expect(await adapters.opencode({ type: "oauth", access: "test-token", orgID: "org_test" }, 1000)).toEqual([
      { kind: "credit", label: "credits", remaining: 12.5, currency: "USD" },
    ])
    expect(fetch).toHaveBeenCalledWith("https://opencode.ai/console/api/billing/status", expect.objectContaining({ headers: {
      Accept: "application/json", Authorization: "Bearer test-token", "x-org-id": "org_test",
    }, redirect: "error" }))
  })
  it("distinguishes available credit from prepaid balance and accepts zero", () => {
    expect(parseBilling({ mode: "credit", availableMicroCents: "2000000000", balanceMicroCents: "-1000000000" })[0]).toMatchObject({ remaining: 20, label: "available credit" })
    expect(parseBilling({ mode: "prepaid", balanceMicroCents: "0" })[0]).toMatchObject({ remaining: 0 })
  })
  it("normalizes subscription meters, unstarted windows, and absent subscriptions", () => {
    expect(parseSubscription(null)).toEqual([])
    expect(parseSubscription({ access: null })).toEqual([])
    expect(parseSubscription({ product: "go-plus", access: { meters: {
      fiveHour: { limitMicroCents: "100000000", usedMicroCents: "25000000", resetsAt: null },
      week: { limitMicroCents: "200000000", usedMicroCents: "100000000", resetsAt: "2030-01-01T00:00:00Z" },
    } } })).toMatchObject([{ label: "Go Plus 5h", remainingPercent: 75 }, { label: "Go Plus weekly", remainingPercent: 50 }])
  })
  it("keeps subscription limits readable when billing access is denied", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/billing/status")
      ? new Response(null, { status: 403 })
      : Response.json({ product: "go", access: { meters: { fiveHour: { limitMicroCents: "100", usedMicroCents: "25", resetsAt: null } } } })))
    expect(await adapters.opencode({ type: "api", key: "test-key" }, 1000)).toMatchObject([{ label: "Go 5h", remainingPercent: 75 }])
  })
})
