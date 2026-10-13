export type AuthEntry =
  | {
      type: "oauth"
      access: string
      refresh?: string
      expires?: number
      accountId?: string
      consoleServer?: string
      orgID?: string
    }
  | {
      type: "api"
      key: string
      consoleServer?: string
      orgID?: string
      metadata?: Record<string, string>
    }
  | {
      type: "wellknown"
      key: string
      token: string
    }

export type AuthStore = Record<string, AuthEntry>

export type PercentageQuota = {
  kind: "percentage"
  label: string
  remainingPercent: number
  resetsAt?: Date
}

export type CreditQuota = {
  kind: "credit"
  label: string
  remaining: number
  currency?: string
}

export type Quota = PercentageQuota | CreditQuota

export type ProviderUsage = {
  id: string
  name: string
  status: "loading" | "ready" | "unsupported" | "error"
  quotas: Quota[]
  detail?: string
}

export type PluginOptions = {
  refreshIntervalSeconds?: number
  requestTimeoutMs?: number
  showUnavailable?: boolean
}
