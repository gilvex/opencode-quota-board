import type { Quota, Row, Snapshot } from "./rpc.js"
import { safeError, UsageError } from "./adapters.js"

export type Account = { id: string; name: string; account: string; providerIDs: string[]; supported: boolean; fetch: (signal: AbortSignal) => Promise<Quota[]> }

/** One scheduler per location, shared by every terminal attached to that location. */
export class UsageService {
  private rows = new Map<string, Row>()
  private next = new Map<string, number>()
  private failures = new Map<string, number>()
  private pending?: Promise<Snapshot>
  private controller = new AbortController()
  private error?: string
  private generation = 0
  constructor(
    private discover: () => Promise<Account[]>,
    private publish: (snapshot: Snapshot) => void,
    private interval = 60_000,
    private clock = Date.now,
  ) {}

  snapshot(): Snapshot {
    // RPC transports JSON values; omit optional undefined fields recursively.
    return JSON.parse(JSON.stringify({ rows: [...this.rows.values()], refreshing: !!this.pending, error: this.error })) as Snapshot
  }
  private emit() { this.publish(this.snapshot()) }
  invalidate() {
    this.generation++
    this.controller.abort()
    this.controller = new AbortController()
    this.rows.clear()
    this.next.clear()
    this.failures.clear()
    this.emit()
  }
  dispose() { this.generation++; this.controller.abort() }

  refresh(id?: string): Promise<Snapshot> {
    if (this.pending) return this.pending
    if (this.controller.signal.aborted) return Promise.resolve(this.snapshot())
    const generation = this.generation
    const signal = this.controller.signal
    // Start on a microtask so pending is set before publishing loading state.
    this.pending = Promise.resolve().then(async () => {
      try {
        const accounts = await this.discover()
        if (generation !== this.generation) return
        this.error = undefined
        const ids = new Set(accounts.map(a => a.id))
        for (const key of this.rows.keys()) if (!ids.has(key)) { this.rows.delete(key); this.next.delete(key); this.failures.delete(key) }
        for (const a of accounts) if (!this.rows.has(a.id)) this.rows.set(a.id, {
          id: a.id, name: a.name, account: a.account, providerIDs: a.providerIDs,
          status: a.supported ? "loading" : "unsupported", quotas: [],
          detail: a.supported ? undefined : "No supported usage endpoint",
        })
        this.emit()
        await Promise.all(accounts.map(async a => {
          if (!a.supported || (id && a.id !== id) || this.clock() < (this.next.get(a.id) ?? 0)) return
          const old = this.rows.get(a.id)!
          try {
            const quotas = await a.fetch(signal)
            if (signal.aborted || generation !== this.generation) return
            if (!quotas.length) throw new Error("no quota returned")
            this.rows.set(a.id, { ...old, quotas, status: "ready", detail: undefined, updatedAt: this.clock() })
            this.failures.delete(a.id)
            const reset = quotas.map(q => q.resetsAt).filter((at): at is number => at !== undefined && at > this.clock()).sort((a, b) => a - b)[0]
            this.next.set(a.id, Math.min(this.clock() + this.interval, reset ? Math.max(this.clock() + 15_000, reset + 2000) : Infinity))
          } catch (error) {
            if (signal.aborted || generation !== this.generation) return
            const count = (this.failures.get(a.id) ?? 0) + 1
            this.failures.set(a.id, count)
            this.rows.set(a.id, { ...old, status: old.quotas.length ? "stale" : "error", detail: safeError(error) })
            this.next.set(a.id, Math.max(this.clock() + Math.min(900_000, this.interval * 2 ** Math.min(count, 4)), error instanceof UsageError ? error.retryAt ?? 0 : 0))
          }
          this.emit()
        }))
      } catch {
        if (generation === this.generation) this.error = "Could not discover connected accounts; retry shortly"
      }
    }).finally(() => {
      this.pending = undefined
      if (!this.controller.signal.aborted) {
        this.emit()
        if (generation !== this.generation) void this.refresh()
      }
    }).then(() => this.snapshot())
    return this.pending
  }

  /** Manual refresh bypasses normal TTL, but preserves failure/rate-limit backoff. */
  manual(id?: string) {
    for (const key of this.next.keys()) if ((!id || id === key) && !this.failures.has(key)) this.next.delete(key)
    return this.refresh(id)
  }
}
