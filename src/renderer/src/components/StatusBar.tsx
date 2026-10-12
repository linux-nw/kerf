import { WifiOff } from 'lucide-react'
import type { NetworkStatus } from '@shared/types'

export function StatusBar({ network }: { network: NetworkStatus | null }) {
  const blocked = network?.blockedRequests ?? 0
  return (
    <footer className="kf-local kf-local--bar" role="contentinfo">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <WifiOff className="kf-icon kf-icon--sm" aria-hidden="true" />
        Keine Daten verlassen diesen Rechner.
      </span>
      <span className="kf-local__net">Netzwerk: gesperrt{blocked > 0 ? `, ${blocked} Anfragen blockiert` : ''}</span>
    </footer>
  )
}
