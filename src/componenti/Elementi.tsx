// src/componenti/Elementi.tsx — elementi minuti dell'apparato, condivisi fra la
// colonna contesto (F2.2) e il pannello note (F2.4): badge di confidenza, segno
// geometrico dello status, marchio "da verificare", elenco delle fonti.
// Stanno qui perché la grammatica visiva della confidenza deve essere la stessa
// ovunque (DESIGN.md §4): un solo posto in cui è scritta.

import { ETICHETTA_CONFIDENZA, GLOSSA_CONFIDENZA } from '../lib/confidenza.ts'
import type { Confidenza, Fonte, NotaDiMetodo as TipoNotaDiMetodo } from '../tipi/index.ts'

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

/** Dicitura unica per lo stato di perimetro: un solo posto in cui è scritta. */
export const ETICHETTA_FUORI_PERIMETRO = 'non ancora entrato in curation'
export const GLOSSA_FUORI_PERIMETRO =
  'Nessuna pericope curata lo nomina ancora: il record viene dall’import e non porta nessun giudizio del progetto.'

/**
 * Luogo fuori dal perimetro della curation. Non è un sesto grado della scala e
 * non deve sembrarlo: la scala resta chiusa ai 5 valori più `attribuito`.
 *
 * Per questo il segno non è una delle sei forme — cinque quadrangolari più il
 * cerchio — ma una lineetta, che in quest'app significa già «nessun valore» (i
 * binari della timeline la usano per le pericopi senza collocazione). Nessun
 * colore di status e nessun fondo tinto: l'assenza di forma e di colore *è*
 * l'informazione, cioè che qui un giudizio non c'è. Resta distinguibile in
 * bianco e nero, come chiede DESIGN.md §4.
 */
export function SegnoFuoriPerimetro() {
  return (
    <span className="segno-fuori-perimetro" title={GLOSSA_FUORI_PERIMETRO} aria-hidden="true" />
  )
}

/** La stessa cosa scritta per esteso, per quando il segno da solo non basta. */
export function TagFuoriPerimetro() {
  return (
    <span className="tag-fuori-perimetro" title={GLOSSA_FUORI_PERIMETRO}>
      {ETICHETTA_FUORI_PERIMETRO}
    </span>
  )
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

/**
 * Nota di metodo dell'asse composizione: la scelta editoriale del progetto —
 * perché una pericope porti una forbice sola su un testo che ne conterrebbe due.
 *
 * Non è una posizione della letteratura, e la resa deve dirlo prima che si legga.
 * Le posizioni portano tutte un filetto verticale a sinistra, del colore della
 * prospettiva a cui appartengono (DESIGN.md §4); questa non ne porta nessuno e sta
 * in fondo alla sezione, dopo le voci: è la nota a piè di pagina dell'apparato, non
 * una colonna in più nel coro. La distinzione è quindi strutturale e tipografica,
 * non affidata al colore.
 *
 * Niente tratteggio: `dashed` e `dotted` sono già la grammatica dell'incertezza
 * (`da_verificare`, status `disputed` e `speculative`), e una scelta dichiarata del
 * progetto non è una cosa incerta. Niente badge di confidenza: il tipo non ne ha
 * uno, e non deve sembrare che gliene manchi uno.
 */
export function NotaDiMetodo({ nota, dettagli = false }: { nota: TipoNotaDiMetodo; dettagli?: boolean }) {
  return (
    <div className="nota-di-metodo">
      <p className="nota-di-metodo-genere">Scelta editoriale del progetto</p>
      <p className="nota-di-metodo-etichetta">{nota.etichetta}</p>
      <p className="asse-sintesi">{nota.sintesi}</p>
      <ElencoFonti fonti={nota.fonti} dettagli={dettagli} />
    </div>
  )
}
