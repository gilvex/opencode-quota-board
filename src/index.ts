import { Plugin } from "@opencode/plugin"
import { adapters } from "./adapters.js"
import { Board } from "./rpc.js"
import { UsageService, type Account } from "./service.js"
import type { AuthEntry } from "./legacy-types.js"

export default Plugin.define({
  id: "opencode-quota-board.server",
  async setup(ctx) {
    const interval = bounded(ctx.options.refreshIntervalSeconds, 60, 15, 3600) * 1000
    const timeout = bounded(ctx.options.requestTimeoutMs, 10_000, 1000, 60_000)
    let lastSeen = 0
    const service = new UsageService(async () => {
      const [integrations, providers] = await Promise.all([ctx.integration.list(), ctx.provider.list()])
      const accounts: Account[] = []
      for (const integration of integrations.data) {
        const connection = await ctx.integration.connection.active(integration.id)
        if (!connection) continue
        const matching = providers.data.filter(p => p.integrationID === integration.id || p.id === integration.id)
        if (!matching.length) continue // MCP and other non-model integrations are not quota accounts.
        const providerIDs = matching.map(p => p.id)
        const adapterID = [integration.id, ...providerIDs].find(id => adapters[id])
        const identity = connection.type === "credential" ? connection.id : `env:${connection.name}`
        accounts.push({
          id: `${integration.id}:${identity}:${adapterID ?? "unsupported"}`, name: integration.name,
          account: connection.type === "credential" ? connection.label : connection.name,
          providerIDs, supported: !!adapterID,
          async fetch(signal) {
            const value = await ctx.integration.connection.resolve(connection)
            const consoleMetadata = integration.id === "opencode" ? {
              consoleServer: typeof value?.metadata?.server === "string" ? value.metadata.server : undefined,
              orgID: typeof value?.metadata?.orgID === "string" ? value.metadata.orgID : undefined,
            } : {}
            let auth: AuthEntry
            if (value?.type === "oauth") auth = {
              type: "oauth", access: value.access,
              accountId: typeof value.metadata?.accountId === "string" ? value.metadata.accountId : undefined,
              ...consoleMetadata,
            }
            else if (value?.type === "key") auth = { type: "api", key: value.key, ...consoleMetadata }
            else throw new Error("usage request requires supported credentials")
            const quotas = await adapters[adapterID!](auth, timeout, signal)
            return quotas.map(q => q.kind === "percentage"
              ? { kind: q.kind, label: q.label, remaining: q.remainingPercent, resetsAt: q.resetsAt?.getTime() }
              : { kind: q.kind, label: q.label, remaining: q.remaining, currency: q.currency })
          },
        })
      }
      return accounts
    }, snapshot => { void registration.events.emit("updated", snapshot).catch(() => {}) }, interval)
    const registration = await ctx.rpc.register(Board, {
      snapshot: async () => { lastSeen = Date.now(); void service.refresh(); return service.snapshot() },
      refresh: async ({ id }) => { lastSeen = Date.now(); return service.manual(id) },
    })
    const timer = setInterval(() => { if (Date.now() - lastSeen < 120_000) void service.refresh() }, 15_000)
    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "credential.switched" || event.type === "credential.updated") {
          service.invalidate()
          if (Date.now() - lastSeen < 120_000) void service.refresh()
        }
        if (event.type === "session.execution.succeeded" && Date.now() - lastSeen < 120_000) void service.refresh()
      }
    })().catch(() => {})
    return () => { clearInterval(timer); controller.abort(); service.dispose() }
  },
})

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}
