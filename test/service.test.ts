import { describe, expect, it, vi } from "vitest"
import { UsageService, type Account } from "../src/service.js"
import { UsageError } from "../src/adapters.js"
import { summary, resetLabel } from "../src/format.js"

const quotas = [{ kind: "percentage" as const, label: "weekly", remaining: 28 }]
const account = (fetch: Account["fetch"], id = "one"): Account => ({ id, name: "Test", account: "Personal", providerIDs: ["test"], supported: true, fetch })

describe("usage service", () => {
  it("deduplicates refreshes and publishes fast providers before slow ones", async () => {
    let finish!: (value: typeof quotas) => void
    const slow = vi.fn(() => new Promise<typeof quotas>(resolve => { finish = resolve }))
    const publish = vi.fn()
    const service = new UsageService(async () => [account(async () => quotas), account(slow, "two")], publish)
    const pending = service.refresh()
    expect(service.refresh()).toBe(pending)
    await vi.waitFor(() => expect(service.snapshot().rows[0]?.status).toBe("ready"))
    expect(service.snapshot().rows[1]?.status).toBe("loading")
    finish(quotas)
    await pending
    expect(slow).toHaveBeenCalledTimes(1)
    expect(service.snapshot().refreshing).toBe(false)
    service.dispose()
  })
  it("retains last successful data and respects retry-after even on manual refresh", async () => {
    let now = Date.now()
    const fetch = vi.fn().mockResolvedValueOnce(quotas).mockRejectedValue(new UsageError(429, "600"))
    const service = new UsageService(async () => [account(fetch)], () => {}, 1000, () => now)
    await service.refresh()
    now += 1001
    await service.refresh()
    expect(service.snapshot().rows[0]).toMatchObject({ status: "stale", quotas })
    await service.manual()
    expect(fetch).toHaveBeenCalledTimes(2)
    now += 601_000
    await service.refresh()
    expect(fetch).toHaveBeenCalledTimes(3)
    service.dispose()
  })
  it("does not reuse another account's readings", async () => {
    let id = "one"
    const service = new UsageService(async () => [account(async () => id === "one" ? quotas : [], id)], () => {})
    await service.refresh()
    id = "two"
    await service.refresh()
    expect(service.snapshot().rows).toHaveLength(1)
    expect(service.snapshot().rows[0]).toMatchObject({ id: "two", status: "error", quotas: [] })
    service.dispose()
  })
  it("aborts in-flight requests on unload without publishing their results", async () => {
    let signal!: AbortSignal
    let finish!: (value: typeof quotas) => void
    const publish = vi.fn()
    const service = new UsageService(async () => [account(s => { signal = s; return new Promise(resolve => { finish = resolve }) })], publish)
    const pending = service.refresh()
    await vi.waitFor(() => expect(signal).toBeDefined())
    service.dispose()
    const calls = publish.mock.calls.length
    expect(signal.aborted).toBe(true)
    finish(quotas)
    await pending
    expect(publish).toHaveBeenCalledTimes(calls)
  })
  it("shows the limiting window and never claims a timed-out window replenished", () => {
    expect(summary({ id: "x", name: "Test", account: "", providerIDs: [], status: "ready", quotas: [
      { kind: "percentage", label: "5h", remaining: 90 }, ...quotas,
    ] })).toBe("weekly 28%")
    expect(resetLabel(1000, 2000)).toBe("reset pending refresh")
  })
})
