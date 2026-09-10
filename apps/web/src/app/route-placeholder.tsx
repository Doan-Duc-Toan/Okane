/**
 * Temporary placeholder element for a route not yet built by its owning
 * phase. Each subsequent UI phase swaps its own placeholder(s) for the real
 * page in routes.tsx — an append/replace, never a restructure of this file.
 */
export function RoutePlaceholder({ label }: { label: string }) {
  return <div style={{ padding: '2rem', opacity: 0.6 }}>{label} — coming soon</div>
}
