export * as ConfigProviderAllowlist from "./provider-allowlist"

function normalizeSet(items: readonly string[] | Set<string> | undefined) {
  if (!items) return undefined
  const values = items instanceof Set ? [...items] : items
  return new Set(values.map((id) => id.toLowerCase()))
}

export function isProviderAllowed(
  providerID: string,
  input?: {
    enabled?: readonly string[] | Set<string>
    disabled?: readonly string[] | Set<string>
  },
) {
  const id = providerID.toLowerCase()
  const enabled = normalizeSet(input?.enabled)
  const disabled = normalizeSet(input?.disabled)
  if (enabled && !enabled.has(id)) return false
  if (disabled?.has(id)) return false
  return true
}
