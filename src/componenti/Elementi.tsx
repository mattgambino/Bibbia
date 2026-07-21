// src/componenti/Elementi.tsx — elementi minuti dell'apparato, condivisi fra la
// colonna contesto (F2.2) e il pannello note (F2.4): badge di confidenza, segno
// geometrico dello status, marchio "da verificare", elenco delle fonti.
// Stanno qui perché la grammatica visiva della confidenza deve essere la stessa
// ovunque (DESIGN.md §4): un solo posto in cui è scritta.

import { ETICHETTA_CONFIDENZA, GLOSSA_CONFIDENZA } from '../lib/confidenza.ts'
import type { Confidenza, Fonte } from '../tipi/index.ts'

export function SegnoStatus({ status }: { status: Confidenza }) {
  return (
    <span className={`segno-status segno-status--${status}`} title={GLOSSA_CONFIDENZA[status]}>
      <span className="solo-lettore-schermo">Status: {ETICHETTA_CONFIDENZA[status]}. </span>
    </span>
  )
}

export function BadgeConfidenza({ status }: { status: Confidenza }) {
  return (
    <span className={`badge badge--${status}`} title={GLOSSA_CONFIDENZA[status]}>
      {ETICHETTA_CONFIDENZA[status]}
    </span>
  )
}

export function SegnoDaVerificare() {
  return <p className="scheda-verificare">Da verificare</p>
}

/**
 * `dettagli` mostra il campo `dettaglio` della fonte — la pagina, la sezione, il
 * codice esatto su cui la nota si regge. Nel pannello note serve, ed è ciò che
 * rende un claim verificabile; nelle miniature della colonna contesto no: lì le
 * fonti sono un rimando, non l'apparato completo.
 */
export function ElencoFonti({ fonti, dettagli = false }: { fonti: Fonte[]; dettagli?: boolean }) {
  if (fonti.length === 0) return null
  return (
    <ul className="fonti">
      {fonti.map((f, i) => (
        <li key={`${f.titolo}-${i}`}>
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer noopener">
              {f.autore ? `${f.autore}, ` : ''}
              {f.titolo}
            </a>
          ) : (
            <>
              {f.autore ? `${f.autore}, ` : ''}
              {f.titolo}
            </>
          )}
          {f.anno ? ` (${f.anno})` : ''}
          {dettagli && f.dettaglio ? ` — ${f.dettaglio}` : ''}
        </li>
      ))}
    </ul>
  )
}
