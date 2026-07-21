// src/componenti/ColonnaContesto.tsx — colonna destra: Dove / Quando / Chi
// sincronizzati con la pericope visibile durante lo scroll (ROADMAP F2.2).
//
// Tre scelte che reggono tutto il file:
// 1. L'unità di sincronizzazione è la pericope, non il versetto: è a quella che
//    la curation attacca luoghi, tempi e personaggi.
// 2. I tre assi temporali restano tre sezioni distinte, ciascuna con la sua
//    scala e la sua etichetta. Non esiste un asse "unico" da nessuna parte.
// 3. L'assenza di dato è dato: passo non ancora curato, luogo senza
//    localizzazione, tempo senza ancoraggio si scrivono per esteso invece di
//    lasciare un pannello vuoto che sembra un guasto.

import { useMemo, useRef, useState } from 'react'
import { Minimappa } from './Minimappa.tsx'
import { ETICHETTA_CONFIDENZA, GLOSSA_CONFIDENZA } from '../lib/confidenza.ts'
import { etichettaAnni, etichettaAnno, etichettaRange } from '../lib/pericopi.ts'
import type { Caricamento } from '../dati/hooks.ts'
import type { Eventi, Luoghi, Persone } from '../dati/caricamento.ts'
import type { Confidenza, Evento, Fonte, Luogo, Persona, RangeAnni } from '../tipi/index.ts'

type Tab = 'dove' | 'quando' | 'chi'
const TAB: { id: Tab; etichetta: string }[] = [
  { id: 'dove', etichetta: 'Dove' },
  { id: 'quando', etichetta: 'Quando' },
  { id: 'chi', etichetta: 'Chi' },
]

type Props = {
  pericope: Evento | null
  eventi: Caricamento<Eventi>
  luoghi: Caricamento<Luoghi>
  persone: Caricamento<Persone>
}

export function ColonnaContesto({ pericope, eventi, luoghi, persone }: Props) {
  const [tab, setTab] = useState<Tab>('dove')
  const bottoni = useRef<(HTMLButtonElement | null)[]>([])

  const luoghiPerId = useMemo(
    () => new Map(luoghi.stato === 'pronto' ? luoghi.dati.map((l) => [l.id, l]) : []),
    [luoghi],
  )
  const personePerId = useMemo(
    () => new Map(persone.stato === 'pronto' ? persone.dati.map((p) => [p.id, p]) : []),
    [persone],
  )

  // Le frecce spostano il fuoco fra i tab, come da pratica ARIA: il tab attivo
  // è l'unico raggiungibile con Tab dall'esterno.
  const tastiera = (e: React.KeyboardEvent, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (passo === 0) return
    e.preventDefault()
    const prossimo = (indice + passo + TAB.length) % TAB.length
    setTab(TAB[prossimo].id)
    bottoni.current[prossimo]?.focus()
  }

  return (
    <section className="pannello pannello-contesto" aria-label="Contesto della pericope">
      <div className="pannello-testa">
        <h2>Contesto</h2>
      </div>

      <Intestazione pericope={pericope} eventi={eventi} />

      <div className="tab-barra" role="tablist" aria-label="Aspetti del contesto">
        {TAB.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`pannello-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => {
              bottoni.current[i] = el
            }}
            onKeyDown={(e) => tastiera(e, i)}
            onClick={() => setTab(t.id)}
          >
            {t.etichetta}
          </button>
        ))}
      </div>

      <div className="tab-pannello" role="tabpanel" id={`pannello-${tab}`} aria-labelledby={`tab-${tab}`}>
        {!pericope ? (
          <p className="vuoto">Il contesto compare quando il passo in lettura appartiene a una pericope curata.</p>
        ) : tab === 'dove' ? (
          <Dove pericope={pericope} luoghiPerId={luoghiPerId} stato={luoghi} />
        ) : tab === 'quando' ? (
          <Quando pericope={pericope} eventi={eventi} />
        ) : (
          <Chi pericope={pericope} personePerId={personePerId} stato={persone} />
        )}
      </div>
    </section>
  )
}

/** Che cosa si sta guardando: titolo della pericope e suo range, o perché manca. */
function Intestazione({ pericope, eventi }: { pericope: Evento | null; eventi: Caricamento<Eventi> }) {
  if (pericope) {
    return (
      <div className="pericope">
        <p className="pericope-titolo">
          {pericope.titolo}
          {pericope.da_verificare && (
            <>
              {' '}
              <span className="da-verificare-segno" aria-hidden="true">
                ⌇
              </span>
              <span className="solo-lettore-schermo"> (curation da verificare)</span>
            </>
          )}
        </p>
        <p className="pericope-range">{etichettaRange(pericope.range.da, pericope.range.a)}</p>
      </div>
    )
  }
  if (eventi.stato === 'in_corso') return <p className="vuoto">Caricamento della curation…</p>
  if (eventi.stato === 'errore')
    return (
      <p className="stato-errore" role="alert">
        Curation non caricata: {eventi.messaggio}
      </p>
    )
  return (
    <p className="vuoto">
      {eventi.dati.length === 0
        ? 'Nessuna curation installata: events.json non è ancora in public/data/.'
        : 'Passo fuori dai capitoli già curati.'}
    </p>
  )
}

/* ------------------------------------------------------------------ Dove --- */

function Dove({
  pericope,
  luoghiPerId,
  stato,
}: {
  pericope: Evento
  luoghiPerId: Map<string, Luogo>
  stato: Caricamento<Luoghi>
}) {
  if (stato.stato === 'in_corso') return <p className="vuoto">Caricamento dei luoghi…</p>
  if (stato.stato === 'errore')
    return (
      <p className="stato-errore" role="alert">
        Luoghi non caricati: {stato.messaggio}
      </p>
    )

  const elencati = pericope.luoghi.map((id) => luoghiPerId.get(id)).filter((l): l is Luogo => !!l)
  const mancanti = pericope.luoghi.filter((id) => !luoghiPerId.has(id))
  // Un luogo `symbolic` non va sulla carta nemmeno quando OpenBible propone dei
  // candidati (è il caso di Eden): la curation ha giudicato il riferimento
  // simbolico, e un marker lo rimetterebbe in gioco come localizzazione. Le
  // ipotesi restano leggibili nell'elenco, con il loro peso.
  const conCoordinate = elencati.filter((l) => l.status !== 'symbolic' && l.candidati.length > 0)

  if (pericope.luoghi.length === 0)
    return <p className="vuoto">La pericope non nomina luoghi.</p>

  return (
    <>
      {conCoordinate.length > 0 && <Minimappa luoghi={conCoordinate} />}
      <ul className="schede">
        {elencati.map((luogo) => (
          <li key={luogo.id} className="scheda">
            <p className="scheda-testa">
              <SegnoStatus status={luogo.status} />{' '}
              <span className="scheda-nome">{luogo.nomi.it || luogo.nomi.translit || luogo.id}</span>
              {luogo.nomi.he && (
                <>
                  {' '}
                  <bdi className="lemma" lang="he" dir="rtl">
                    {luogo.nomi.he}
                  </bdi>
                </>
              )}
            </p>
            {luogo.nomi.it && luogo.nomi.translit && <p className="translit">{luogo.nomi.translit}</p>}
            {luogo.status === 'symbolic' && (
              <p className="conteggio">
                Luogo simbolico: non collocato sulla carta.
                {luogo.candidati.length > 0 && ' Le ipotesi dei repertori restano elencate qui sotto.'}
              </p>
            )}
            {luogo.candidati.length === 0 ? (
              luogo.status !== 'symbolic' && <p className="conteggio">Nessuna localizzazione proposta.</p>
            ) : (
              <ul className="candidati">
                {luogo.candidati.map((c) => (
                  <li key={c.id}>
                    {c.etichetta}
                    {c.peso_openbible !== undefined && (
                      <span className="conteggio"> · peso OpenBible {c.peso_openbible.toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {luogo.da_verificare && <SegnoDaVerificare />}
          </li>
        ))}
      </ul>
      {mancanti.length > 0 && (
        <p className="conteggio">Luoghi citati dalla pericope ma assenti da places.json: {mancanti.join(', ')}.</p>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- Quando --- */

/** Estremi osservati su tutta la curation: la scala di ogni asse viene dai dati, non da un intervallo scelto a tavolino. */
function dominio(valori: (RangeAnni | null)[]): RangeAnni | null {
  const presenti = valori.filter((v): v is RangeAnni => v !== null)
  if (presenti.length === 0) return null
  const da = Math.min(...presenti.map((v) => v.da))
  const a = Math.max(...presenti.map((v) => v.a))
  return a > da ? { da, a } : null
}

function Quando({ pericope, eventi }: { pericope: Evento; eventi: Caricamento<Eventi> }) {
  const domini = useMemo(() => {
    const tutti = eventi.stato === 'pronto' ? eventi.dati : []
    return {
      narrato: dominio(tutti.map((e) => e.tempo_narrato.am)),
      storico: dominio(tutti.map((e) => e.tempo_storico.ancoraggio)),
      composizione: dominio(tutti.map((e) => e.composizione.range)),
    }
  }, [eventi])

  return (
    <div className="assi">
      <section className="asse">
        <h3>Tempo narrato</h3>
        <p className="asse-nota">Cronologia interna al racconto (Anno Mundi). Dato testuale, non affermazione storica.</p>
        <MiniAsse dominio={domini.narrato} range={pericope.tempo_narrato.am} unita="AM" />
        <p className="asse-valore">
          {etichettaAnni(pericope.tempo_narrato.am) ?? 'Nessuna cifra di anni in questo passo.'}
        </p>
        {pericope.tempo_narrato.nota && <p className="asse-sintesi">{pericope.tempo_narrato.nota}</p>}
      </section>

      <section className="asse">
        <h3>Tempo storico-critico</h3>
        <p className="asse-nota">Ancoraggio dell'evento narrato a una storia esterna, se esiste.</p>
        <MiniAsse dominio={domini.storico} range={pericope.tempo_storico.ancoraggio} unita="anni" />
        <p className="asse-valore">
          {etichettaAnni(pericope.tempo_storico.ancoraggio) ?? 'Nessun ancoraggio storico.'}{' '}
          <BadgeConfidenza status={pericope.tempo_storico.confidence} />
        </p>
        <p className="asse-sintesi">{pericope.tempo_storico.sintesi}</p>
        <ElencoFonti fonti={pericope.tempo_storico.fonti} />
      </section>

      <section className="asse">
        <h3>Composizione</h3>
        <p className="asse-nota">Quando il testo è stato scritto e redatto: asse indipendente dai due precedenti.</p>
        <MiniAsse dominio={domini.composizione} range={pericope.composizione.range} unita="anni" />
        <p className="asse-valore">{etichettaAnni(pericope.composizione.range)}</p>
        {pericope.composizione.posizioni.map((p) => (
          <div key={p.etichetta} className="posizione">
            <p className="posizione-etichetta">{p.etichetta}</p>
            <p className="asse-sintesi">{p.sintesi}</p>
            <ElencoFonti fonti={p.fonti} />
          </div>
        ))}
      </section>
    </div>
  )
}

/**
 * Asse in miniatura: la barra dice dove cade questa pericope rispetto a tutte le
 * altre già curate. Senza dominio (nessun evento ha quell'asse) la barra non si
 * disegna affatto: una scala inventata direbbe più di quel che sappiamo.
 */
function MiniAsse({ dominio, range, unita }: { dominio: RangeAnni | null; range: RangeAnni | null; unita: string }) {
  if (!dominio) return null
  const larghezza = dominio.a - dominio.da
  const testo = range
    ? `${unita}: da ${range.da} a ${range.a}, sull'intervallo curato da ${dominio.da} a ${dominio.a}`
    : `${unita}: nessun valore per questa pericope`

  return (
    <div className="mini-asse" role="img" aria-label={testo}>
      <div className="mini-asse-traccia">
        {range && (
          <div
            className="mini-asse-segmento"
            style={{
              left: `${((range.da - dominio.da) / larghezza) * 100}%`,
              width: `${Math.max(((range.a - range.da) / larghezza) * 100, 1.5)}%`,
            }}
          />
        )}
      </div>
      <p className="mini-asse-estremi" aria-hidden="true">
        <span>{etichettaAnno(dominio.da)}</span>
        <span>{etichettaAnno(dominio.a)}</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------- Chi --- */

function Chi({
  pericope,
  personePerId,
  stato,
}: {
  pericope: Evento
  personePerId: Map<string, Persona>
  stato: Caricamento<Persone>
}) {
  if (stato.stato === 'in_corso') return <p className="vuoto">Caricamento delle persone…</p>
  if (stato.stato === 'errore')
    return (
      <p className="stato-errore" role="alert">
        Persone non caricate: {stato.messaggio}
      </p>
    )
  if (pericope.persone.length === 0) return <p className="vuoto">La pericope non nomina personaggi.</p>

  const nome = (id: string) => {
    const p = personePerId.get(id)
    return p ? p.nomi.it || p.nomi.translit || p.id : id
  }
  const elencate = pericope.persone.map((id) => personePerId.get(id)).filter((p): p is Persona => !!p)
  const mancanti = pericope.persone.filter((id) => !personePerId.has(id))

  return (
    <>
      <ul className="schede">
        {elencate.map((persona) => {
          const parentele: [string, string[]][] = [
            ['padre', persona.relazioni.padre ? [nome(persona.relazioni.padre)] : []],
            ['madre', persona.relazioni.madre ? [nome(persona.relazioni.madre)] : []],
            ['coniugi', persona.relazioni.coniugi.map(nome)],
            ['figli', persona.relazioni.figli.map(nome)],
          ]
          return (
            <li key={persona.id} className="scheda">
              <p className="scheda-testa">
                <span className="scheda-nome">{persona.nomi.it || persona.nomi.translit || persona.id}</span>
                {persona.nomi.he && (
                  <>
                    {' '}
                    <bdi className="lemma" lang="he" dir="rtl">
                      {persona.nomi.he}
                    </bdi>
                  </>
                )}
              </p>
              {persona.nomi.it && persona.nomi.translit && <p className="translit">{persona.nomi.translit}</p>}
              <dl className="parentele">
                {parentele
                  .filter(([, v]) => v.length > 0)
                  .map(([etichetta, valori]) => (
                    <div key={etichetta}>
                      <dt>{etichetta}</dt>
                      <dd>{valori.join(', ')}</dd>
                    </div>
                  ))}
              </dl>
              {persona.dati_narrativi?.eta_totale != null && (
                <p className="conteggio">Età nel racconto: {persona.dati_narrativi.eta_totale} anni.</p>
              )}
              <p className="conteggio">{persona.riferimenti.length} riferimenti nel Pentateuco.</p>
              {persona.da_verificare && <SegnoDaVerificare />}
            </li>
          )
        })}
      </ul>
      {mancanti.length > 0 && (
        <p className="conteggio">Persone citate dalla pericope ma assenti da people.json: {mancanti.join(', ')}.</p>
      )}
    </>
  )
}

/* ------------------------------------------------------------ elementi --- */

function SegnoStatus({ status }: { status: Confidenza }) {
  return (
    <span className={`segno-status segno-status--${status}`} title={GLOSSA_CONFIDENZA[status]}>
      <span className="solo-lettore-schermo">Status: {ETICHETTA_CONFIDENZA[status]}. </span>
    </span>
  )
}

function BadgeConfidenza({ status }: { status: Confidenza }) {
  return (
    <span className={`badge badge--${status}`} title={GLOSSA_CONFIDENZA[status]}>
      {ETICHETTA_CONFIDENZA[status]}
    </span>
  )
}

function SegnoDaVerificare() {
  return <p className="scheda-verificare">Da verificare</p>
}

function ElencoFonti({ fonti }: { fonti: Fonte[] }) {
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
        </li>
      ))}
    </ul>
  )
}
