import { useContent } from '../content-context'

export function StatusBadge({ status }: { status: string }) {
  const { t } = useContent()
  const className = status.toLowerCase().replaceAll('_', '-')
  const label = t(`status.${status}`)

  return <span className={`status-badge status-${className}`}>{label}</span>
}