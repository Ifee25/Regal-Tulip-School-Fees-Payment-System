import { getPaymentStatus } from '../utils/payments'

export default function StatusBadge({ paid, expected, label }) {
  const status = label || getPaymentStatus(paid, expected)
  return <span className={`status-badge status-${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
}
