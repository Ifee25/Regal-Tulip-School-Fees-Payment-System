export function getPaymentStatus(paid = 0, expected = 0) {
  if (!paid || paid <= 0) return 'Not Paid'
  if (expected > 0 && paid >= expected) return 'Paid'
  return 'Part Payment'
}
