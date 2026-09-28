export function formatCurrencyInput(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  const firstDot = cleaned.indexOf('.')
  const integerPart = (firstDot === -1 ? cleaned : cleaned.slice(0, firstDot)) || '0'
  const decimalPart = firstDot === -1
    ? null
    : cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  const formattedInteger = Number(integerPart).toLocaleString('en-NG')

  return decimalPart === null ? formattedInteger : `${formattedInteger}.${decimalPart}`
}

export function parseCurrencyInput(value) {
  return Number(String(value ?? '').replace(/,/g, '')) || 0
}
