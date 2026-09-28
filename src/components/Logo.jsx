export default function Logo({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <img className="brand-logo" src="/regal-tulip-logo.png" alt="Regal Tulip School crest" />
      {!compact && (
        <div>
          <strong>Regal Tulip</strong>
          <small>School Administration</small>
        </div>
      )}
    </div>
  )
}
