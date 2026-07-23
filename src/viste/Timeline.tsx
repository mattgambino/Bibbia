// src/viste/Timeline.tsx — vista timeline a schermo pieno (ROADMAP F3.2).
//
// Tre scelte che reggono il file:
// 1. **Tre binari, tre scale, nessun asse comune.** Non è una precauzione
//    grafica: allineare l'Anno Mundi del racconto con gli anni della redazione
//    darebbe per acquisito proprio ciò che l'app tiene distinto. Ogni binario
//    calcola il suo dominio sui suoi dati e lo dichiara con la sua unità; la
//    testata avverte che un allineamento verticale fra binari non significa
//    nulla.
// 2. **Le corsie sono le stesse su tutti e tre**, nell'ordine del testo: è
//    l'unica cosa che i binari condividono, ed è ciò che rende leggibile il
//    confronto — la stessa pericope, tre collocazioni diverse.
// 3. **L'elenco a sinistra è la fonte**, come nella mappa: tutto ciò che sta
//    sui binari sta anche lì, in parole, comprese le pericopi che su un asse non
//    hanno collocazione. La figura è una sintesi, non l'unico accesso.

import { useEffect, useMemo, useRef, useState } from 'react'
import { BinarioTempo } from '../componenti/BinarioTempo.tsx'
import { BadgeConfidenza, ElencoFonti, SegnoDaVerificare } from '../componenti/Elementi.tsx'
import { VoceNota } from '../componenti/PannelloNote.tsx'
import { binari as costruisciBinari, notePericope, ordinaPericopi, riferimentoBreve } from '../lib/tempo.ts'
import { etichettaAnni, etichettaAnniMundi, etichettaRange } from '../lib/pericopi.ts'
import { etichettaVersetto } from '../lib/riferimenti.ts'
import { useEventi, useNote } from '../dati/hooks.ts'
import type { Evento, Nota } from '../tipi/index.ts'

type Props = {
  /** Pericope da aprire all'arrivo: si entra dal tab «Quando» della lettura. */
  pericopeIniziale?: string | null
  onLettura: () => void
  /** Ritorno al testo su un versetto preciso: è l'uscita dalla timeline verso la lettura. */
  onVersetto: (versetto: string) => void
}

export function Timeline({ pericopeIniziale, onLettura, onVersetto }: Props) {
  const eventi = useEventi()
  const note = useNote()
  const [scelta, setScelta] = useState<string | null>(pericopeIniziale ?? null)

  // Si arriva qui da una pagina scorsa a metà: la vista occupa lo schermo e non
  // scorre, quindi senza questo la testata resterebbe sopra il bordo superiore.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const pericopi = useMemo(
    () => (eventi.stato === 'pronto' ? ordinaPericopi(eventi.dati) : []),
    [eventi],
  )
  const binari = useMemo(() => costruisciBinari(pericopi), [pericopi])
  const noteCurate = note.stato === 'pronto' ? note.dati : []

  // La scheda scelta si porta in vista da sé: la si sceglie anche dai binari, e
  // in fondo a un elenco di otto pericopi non si vedrebbe cambiare nulla.
  const elenco = useRef<HTMLUListElement | null>(null)
  useEffect(() => {
    if (!scelta) return
    elenco.current
      ?.querySelector<HTMLElement>(`[data-pericope="${scelta}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [scelta, pericopi])

  const inCorso = eventi.stato === 'in_corso'
  const errore = eventi.stato === 'errore' ? eventi.messaggio : null

  return (
    <div className="timeline-vista">
      <header className="vista-testa">
        <div>
          <p className="marchio">Pentateuco in contesto</p>
          <h1>Tempo</h1>
        </div>
        <button type="button" className="bottone-ritorno" onClick={onLettura}>
          Torna alla lettura
        </button>
      </header>

      <aside className="vista-apparato" aria-label="Elenco delle pericopi e apparato temporale">
        {errore ? (
          <p className="stato-errore" role="alert">
            Curation non caricata: {errore}
          </p>
        ) : inCorso ? (
          <p className="stato-caricamento">Caricamento della curation…</p>
        ) : pericopi.length === 0 ? (
          <p className="vuoto">
            Nessuna pericope da collocare: events.json non è ancora in public/data/.
          </p>
        ) : (
          <>
            <p className="vista-conto" aria-live="polite">
              {pericopi.length === 1 ? '1 pericope curata' : `${pericopi.length} pericopi curate`} ·{' '}
              {etichettaRange(pericopi[0].range.da, pericopi[pericopi.length - 1].range.a)}
            </p>
            <ul className="schede" ref={elenco}>
              {pericopi.map((pericope) => (
                <SchedaPericope
                  key={pericope.id}
                  pericope={pericope}
                  note={notePericope(noteCurate, pericope)}
                  scelta={scelta === pericope.id}
                  onSceglie={() => setScelta((precedente) => (precedente === pericope.id ? null : pericope.id))}
                  onVersetto={onVersetto}
                />
              ))}
            </ul>
            <p className="vista-nota">
              Le pericopi sono quelle di events.json: la curation copre per ora un range del testo, e fuori di
              lì non c’è nulla da collocare. Ogni cifra è un dato curato con le sue fonti, non un calcolo
              dell’app.
            </p>
          </>
        )}
      </aside>

      <main className="timeline-binari">
        <p className="timeline-avvertenza">
          Tre assi, tre scale indipendenti: l’Anno Mundi del racconto non è l’anno dell’era, e la datazione
          della redazione non è quella dei fatti narrati. Confrontare a occhio le posizioni verticali fra un
          binario e l’altro non dice nulla — il confronto che ha senso è fra le pericopi dentro lo stesso
          binario.
        </p>
        {binari.map((binario) => (
          <BinarioTempo key={binario.id} binario={binario} scelta={scelta} onSceglie={setScelta} />
        ))}
      </main>
    </div>
  )
}

/* ---------------------------------------------------------------- scheda --- */

/**
 * Una pericope nell'elenco. Chiusa dice le tre collocazioni in una riga per
 * asse — comprese quelle che non ci sono, che sono un dato quanto le altre.
 * Aperta porta l'apparato completo: sintesi, confidenza, ventaglio delle
 * posizioni, fonti, note curate, e il rimando al testo.
 */
function SchedaPericope({
  pericope,
  note,
  scelta,
  onSceglie,
  onVersetto,
}: {
  pericope: Evento
  note: Nota[]
  scelta: boolean
  onSceglie: () => void
  onVersetto: (versetto: string) => void
}) {
  return (
    <li className={`scheda scheda-pericope${scelta ? ' scheda-pericope--scelta' : ''}`}>
      <button
        type="button"
        className="scheda-maniglia"
        data-pericope={pericope.id}
        aria-expanded={scelta}
        onClick={onSceglie}
      >
        <span className="scheda-testa">
          <span className="scheda-nome">{pericope.titolo}</span>
        </span>
        <span className="conteggio">
          {etichettaRange(pericope.range.da, pericope.range.a)}
          {note.length > 0 && ` · ${note.length === 1 ? '1 nota' : `${note.length} note`}`}
        </span>
        {/* Le tre righe restano visibili anche a scheda chiusa: sono la stessa
            informazione dei binari, in parole, ed è così che si legge senza
            dover interpretare una figura. */}
        <span className="assi-sommario">
          <span>
            <span className="assi-sommario-etichetta">narrato</span>{' '}
            {etichettaAnniMundi(pericope.tempo_narrato.am) ?? 'nessuna cifra'}
          </span>
          <span>
            <span className="assi-sommario-etichetta">storico</span>{' '}
            {etichettaAnni(pericope.tempo_storico.ancoraggio) ?? 'nessun ancoraggio'}
          </span>
          <span>
            <span className="assi-sommario-etichetta">composizione</span>{' '}
            {etichettaAnni(pericope.composizione.range)}
          </span>
        </span>
      </button>

      {scelta && (
        <div className="scheda-apparato">
          <section className="asse">
            <h3>Tempo narrato</h3>
            <p className="asse-valore">
              {etichettaAnniMundi(pericope.tempo_narrato.am) ?? 'Nessuna cifra di anni in questo passo.'}
            </p>
            {pericope.tempo_narrato.nota && <p className="asse-sintesi">{pericope.tempo_narrato.nota}</p>}
            {pericope.tempo_narrato.riferimenti_interni.length > 0 && (
              <p className="scheda-riferimenti">
                {/* I riferimenti interni sono i versetti da cui la cronologia del
                    racconto si ricava: da qui si va a leggerli. */}
                {pericope.tempo_narrato.riferimenti_interni.map((r) => (
                  <button key={r} type="button" className="rimando-versetto" onClick={() => onVersetto(r)}>
                    {etichettaVersetto(r)}
                  </button>
                ))}
              </p>
            )}
          </section>

          <section className="asse">
            <h3>Ancoraggi storici</h3>
            <p className="asse-valore">
              {etichettaAnni(pericope.tempo_storico.ancoraggio) ?? 'Nessun ancoraggio storico.'}{' '}
              {/* La confidenza qualifica anche l'assenza: «il consenso è che non
                  c'è ancoraggio» è un'affermazione, non un vuoto. */}
              <BadgeConfidenza status={pericope.tempo_storico.confidence} />
            </p>
            <p className="asse-sintesi">{pericope.tempo_storico.sintesi}</p>
            <ElencoFonti fonti={pericope.tempo_storico.fonti} dettagli />
          </section>

          <section className="asse">
            <h3>Composizione dei testi</h3>
            <p className="asse-valore">{etichettaAnni(pericope.composizione.range)}</p>
            {pericope.composizione.posizioni.map((p) => (
              <div key={p.etichetta} className="posizione">
                <p className="posizione-etichetta">{p.etichetta}</p>
                <p className="asse-sintesi">{p.sintesi}</p>
                <ElencoFonti fonti={p.fonti} dettagli />
              </div>
            ))}
          </section>

          <section className="asse">
            <h3>Note curate della pericope</h3>
            {note.length === 0 ? (
              <p className="vuoto">Nessuna nota ancorata a questa pericope.</p>
            ) : (
              <ul className="note">
                {note.map((nota) => (
                  <VoceNota key={nota.id} nota={nota} />
                ))}
              </ul>
            )}
          </section>

          <p className="etichetta">Fonti della pericope</p>
          <ElencoFonti fonti={pericope.fonti} dettagli />
          {pericope.da_verificare && <SegnoDaVerificare />}

          <p className="scheda-riferimenti">
            <button
              type="button"
              className="rimando-versetto"
              onClick={() => onVersetto(pericope.range.da)}
            >
              Leggi {riferimentoBreve(pericope)} nel testo
            </button>
          </p>
        </div>
      )}
    </li>
  )
}
