import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"

export const quotaSchema = z.object({
  kind: z.enum(["percentage", "credit"]), label: z.string(), remaining: z.number(),
  currency: z.string().optional(), resetsAt: z.number().optional(),
})
export const rowSchema = z.object({
  id: z.string(), name: z.string(), providerIDs: z.array(z.string()), account: z.string(),
  status: z.enum(["loading", "ready", "stale", "error", "unsupported"]),
  quotas: z.array(quotaSchema), updatedAt: z.number().optional(), detail: z.string().optional(),
})
export const snapshotSchema = z.object({ rows: z.array(rowSchema), refreshing: z.boolean(), error: z.string().optional() })
export type Quota = z.infer<typeof quotaSchema>
export type Row = z.infer<typeof rowSchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export const Board = Rpc.define({
  id: "opencode-quota-board",
  methods: {
    snapshot: { input: z.object({}), output: snapshotSchema },
    refresh: { input: z.object({ id: z.string().optional() }), output: snapshotSchema },
  },
  events: { updated: { schema: snapshotSchema } },
})
