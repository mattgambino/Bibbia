// src/viste/Mappa.tsx — vista mappa a schermo pieno (ROADMAP F3.1).
//
// Tre scelte che reggono il file:
// 1. La carta non è la fonte: è l'elenco a sinistra. Ogni cosa che sta sulla
//    carta sta anche lì, e ci sta pure ciò che sulla carta non può stare
//    (luoghi simbolici, luoghi senza alcuna localizzazione proposta).
// 2. L'insieme mostrato è quello del **range curato**: i luoghi che una pericope
//    curata nomina. places.json ne contiene molti di più, generati da TIPNR, ma
//    su quelli l'app non ha ancora giudizio — e il pannello lo dichiara.
// 3. I filtri tolgono, non aggiungono: si parte da tutto visibile e si escludono
//    status e capitoli. Così lo stato iniziale non dipende dal caricamento dei
//    dati e "nessun filtro" non si confonde con "nessun risultato".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MappaCompleta } from '../componenti/MappaCompleta.tsx'
import type { Selezione } from '../componenti/MappaCompleta.tsx'
import { BadgeConfidenza, ElencoFonti, SegnoDaVerificare, SegnoStatus } from '../componenti/Elementi.tsx'
import { VoceNota } from '../componenti/PannelloNote.tsx'
import { ETICHETTA_CONFIDENZA } from '../lib/confidenza.ts'
import { indicizzaNote } from '../lib/note.ts'
import { capitoliDi, collocabile, etichettaCapitolo, luoghiCurati, nomeLuogo } from '../lib/luoghi.ts'
import type { CapitoloId, LuogoCurato } from '../lib/luoghi.ts'
import { etichettaVersetto } from '../lib/riferimenti.ts'
import { useEventi, useLuoghi, useNote } from '../dati/hooks.ts'
import type { CandidatoLuogo, Confidenza, Luogo, Nota } from '../tipi/index.ts'

type Props = {
  /** Luogo da aprire all'arrivo: la mappa si raggiunge dalla scheda di un luogo. */
  luogoIniziale?: string | null
  onLettura: () => void
  /** Torna alla lettura su un versetto preciso: è l'uscita dalla mappa verso il testo. */
  onVersetto: (versetto: string) => void
}

export function Mappa({ luogoIniziale, onLettura, onVersetto }: Props) {
  const eventi = useEventi()
  const luoghi = useLuoghi()
  const note = useNote()
  const [statusEsclusi, setStatusEsclusi] = useState<Set<Confidenza>>(new Set())
  const [capitoliEsclusi, setCapitoliEsclusi] = useState<Set<CapitoloId>>(new Set())
  const [selezione, setSelezione] = useState<Selezione | null>(null)

  // Si arriva qui da una pagina scorsa a metà: la vista occupa lo schermo e non
  // scorre, quindi senza questo la testata resterebbe sopra il bordo superiore.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const { curati, mancanti } = useMemo(() => {
    if (eventi.stato !== 'pronto' || luoghi.stato !== 'pronto') return { curati: [], mancanti: [] }
    return luoghiCurati(eventi.dati, luoghi.dati)
  }, [eventi, luoghi])

  // Le note ancorate a un luogo non hanno un versetto a cui stare a margine: la
  // scheda nella colonna contesto era finora il loro unico accesso, e qui il
  // popup è la stessa scheda vista dalla carta. Sarebbe strano che l'apparato
  // fosse più povero proprio dove il luogo è al centro.
  const notePerLuogo = useMemo(
    () => indicizzaNote(note.stato === 'pronto' ? note.dati : []).perLuogo,
    [note],
  )

  const statusPresenti = useMemo(() => {
    const conteggio = new Map<Confidenza, number>()
    for (const c of curati) conteggio.set(c.luogo.status, (conteggio.get(c.luogo.status) ?? 0) + 1)
    return [...conteggio]
  }, [curati])

  const capitoliPresenti = useMemo(() => {
    const conteggio = new Map<CapitoloId, number>()
    for (const c of curati) for (const k of c.capitoli) conteggio.set(k, (conteggio.get(k) ?? 0) + 1)
    return capitoliDi(curati).map((k) => [k, conteggio.get(k) ?? 0] as const)
  }, [curati])

  const mostrati = useMemo(
    () =>
      curati.filter(
        (c) =>
          !statusEsclusi.has(c.luogo.status) && c.capitoli.some((k) => !capitoliEsclusi.has(k)),
      ),
    [curati, statusEsclusi, capitoliEsclusi],
  )

  const sceltoNonMostrato = selezione !== null && !mostrati.some((c) => c.luogo.id === selezione.luogo)

  // Un luogo escluso dai filtri non può restare aperto: il popup parlerebbe di
  // qualcosa che la carta non mostra più.
  useEffect(() => {
    if (sceltoNonMostrato) setSelezione(null)
  }, [sceltoNonMostrato])

  // Arrivando dalla colonna contesto si apre subito il luogo da cui si è partiti,
  // sulla sua prima ipotesi: altrimenti la mappa si aprirebbe muta e toccherebbe
  // ritrovarlo a mano.
  const iniziale = useRef(luogoIniziale ?? null)
  useEffect(() => {
    const id = iniziale.current
    if (!id || curati.length === 0) return
    iniziale.current = null
    const trovato = curati.find((c) => c.luogo.id === id)
    if (trovato && collocabile(trovato.luogo)) {
      setSelezione({ luogo: id, candidato: trovato.luogo.candidati[0].id, inquadra: true })
    }
  }, [curati])

  const seleziona = useCallback((s: Selezione | null) => setSelezione(s), [])

  // Dall'elenco: la carta porta in vista tutte le ipotesi del luogo, perché di
  // qui non si sa dove caschino — dalla carta no, quel punto lo si sta guardando.
  const apri = (luogo: Luogo) => {
    if (!collocabile(luogo)) return
    setSelezione({ luogo: luogo.id, candidato: luogo.candidati[0].id, inquadra: true })
  }

  const luogoScelto = mostrati.find((c) => c.luogo.id === selezione?.luogo) ?? null
  const candidatoScelto =
    luogoScelto?.luogo.candidati.find((c) => c.id === selezione?.candidato) ?? null

  const ipotesiMostrate = mostrati
    .filter((c) => collocabile(c.luogo))
    .reduce((n, c) => n + c.luogo.candidati.length, 0)

  const filtriAttivi = statusEsclusi.size > 0 || capitoliEsclusi.size > 0
  const inCorso = eventi.stato === 'in_corso' || luoghi.stato === 'in_corso'
  const errore =
    eventi.stato === 'errore' ? eventi.messaggio : luoghi.stato === 'errore' ? luoghi.messaggio : null

  return (
    <div className="mappa-vista">
      <header className="vista-testa">
        <div>
          <p className="marchio">Pentateuco in contesto</p>
          <h1>Luoghi</h1>
        </div>
        <button type="button" className="bottone-ritorno" onClick={onLettura}>
          Torna alla lettura
        </button>
      </header>

      <aside className="vista-apparato" aria-label="Filtri ed elenco dei luoghi">
        {errore ? (
          <p className="stato-errore" role="alert">
            Luoghi non caricati: {errore}
          </p>
        ) : inCorso ? (
          <p className="stato-caricamento">Caricamento dei luoghi…</p>
        ) : curati.length === 0 ? (
          <p className="vuoto">
            Nessun luogo da mostrare: la curation non nomina ancora luoghi, oppure events.json e
            places.json non sono in public/data/.
          </p>
        ) : (
          <>
            <fieldset className="filtro">
              <legend>Status critico</legend>
              {statusPresenti.map(([status, n]) => (
                <label key={status} className="filtro-voce">
                  <input
                    type="checkbox"
                    checked={!statusEsclusi.has(status)}
                    onChange={() =>
                      setStatusEsclusi((precedenti) => alterna(precedenti, status))
                    }
                  />
                  <SegnoStatus status={status} />
                  <span className="filtro-etichetta">{ETICHETTA_CONFIDENZA[status]}</span>
                  <span className="conteggio">{n}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="filtro">
              <legend>Capitolo</legend>
              {capitoliPresenti.map(([capitolo, n]) => (
                <label key={capitolo} className="filtro-voce">
                  <input
                    type="checkbox"
                    checked={!capitoliEsclusi.has(capitolo)}
                    onChange={() =>
                      setCapitoliEsclusi((precedenti) => alterna(precedenti, capitolo))
                    }
                  />
                  <span className="filtro-etichetta">{etichettaCapitolo(capitolo)}</span>
                  <span className="conteggio">{n}</span>
                </label>
              ))}
            </fieldset>

            {filtriAttivi && (
              <p className="filtro-azzera">
                <button
                  type="button"
                  className="rimando-note"
                  onClick={() => {
                    setStatusEsclusi(new Set())
                    setCapitoliEsclusi(new Set())
                  }}
                >
                  Mostra tutti i luoghi
                </button>
              </p>
            )}

            <p className="vista-conto" aria-live="polite">
              {mostrati.length === 1 ? '1 luogo' : `${mostrati.length} luoghi`} su {curati.length}{' '}
              curati · {ipotesiMostrate} ipotesi sulla carta
            </p>

            {mostrati.length === 0 ? (
              <p className="vuoto">Nessun luogo passa i filtri attivi.</p>
            ) : (
              <ul className="schede">
                {mostrati.map((curato) => (
                  <SchedaLuogo
                    key={curato.luogo.id}
                    curato={curato}
                    note={notePerLuogo.get(curato.luogo.id) ?? []}
                    scelto={selezione?.luogo === curato.luogo.id}
                    onApri={() => apri(curato.luogo)}
                    onVersetto={onVersetto}
                  />
                ))}
              </ul>
            )}

            {mancanti.length > 0 && (
              <p className="conteggio">
                Luoghi citati dalle pericopi ma assenti da places.json: {mancanti.join(', ')}.
              </p>
            )}
            <p className="vista-nota">
              L'elenco è quello dei luoghi nominati dalle pericopi curate. Gli altri record di
              places.json vengono da TIPNR e non hanno ancora un giudizio della curation: qui non
              compaiono.
            </p>
          </>
        )}
      </aside>

      <MappaCompleta luoghi={mostrati} selezione={selezione} onSeleziona={seleziona}>
        {luogoScelto && candidatoScelto && (
          <PopupLuogo
            luogo={luogoScelto.luogo}
            candidato={candidatoScelto}
            note={notePerLuogo.get(luogoScelto.luogo.id) ?? []}
            onCandidato={(id) => setSelezione({ luogo: luogoScelto.luogo.id, candidato: id })}
            onChiudi={() => {
              setSelezione(null)
              // Il fuoco era entrato nel popup: chiudendolo torna da dove era
              // partito, altrimenti si perde in fondo al documento.
              document
                .querySelector<HTMLElement>(`[data-luogo="${luogoScelto.luogo.id}"]`)
                ?.focus()
            }}
          />
        )}
      </MappaCompleta>
    </div>
  )
}

function alterna<T>(insieme: Set<T>, valore: T): Set<T> {
  const nuovo = new Set(insieme)
  if (nuovo.has(valore)) nuovo.delete(valore)
  else nuovo.add(valore)
  return nuovo
}

/* --------------------------------------------------------------- elenco --- */

/**
 * Scheda di un luogo nell'elenco. Per i luoghi collocabili è la maniglia della
 * carta: aprirla apre il popup, dove sta l'apparato completo. Per i luoghi che
 * sulla carta non possono comparire — simbolici, o senza alcuna localizzazione
 * proposta — l'apparato sta qui dentro, perché altrove non avrebbe posto.
 */
function SchedaLuogo({
  curato,
  note,
  scelto,
  onApri,
  onVersetto,
}: {
  curato: LuogoCurato
  note: Nota[]
  scelto: boolean
  onApri: () => void
  onVersetto: (versetto: string) => void
}) {
  const { luogo } = curato
  const suCarta = collocabile(luogo)

  const identita = (
    <>
      <span className="scheda-testa">
        <SegnoStatus status={luogo.status} />{' '}
        <span className="scheda-nome">{nomeLuogo(luogo)}</span>
        {luogo.nomi.he && (
          <>
            {' '}
            <bdi className="lemma" lang="he" dir="rtl">
              {luogo.nomi.he}
            </bdi>
          </>
        )}
      </span>
      {luogo.nomi.it && luogo.nomi.translit && <span className="translit">{luogo.nomi.translit}</span>}
      <span className="conteggio">
        {curato.capitoli.map(etichettaCapitolo).join(' · ')}
        {suCarta && ` · ${luogo.candidati.length} ipotesi`}
        {/* Quali luoghi portino una nota curata si vede dall'elenco, senza
            aprirli uno per uno: è il motivo per cui il conteggio sta qui. */}
        {note.length > 0 && ` · ${note.length === 1 ? '1 nota' : `${note.length} note`}`}
      </span>
    </>
  )

  return (
    <li className={`scheda scheda-luogo${scelto ? ' scheda-luogo--scelta' : ''}`}>
      {suCarta ? (
        <button
          type="button"
          className="scheda-maniglia"
          data-luogo={luogo.id}
          aria-pressed={scelto}
          onClick={onApri}
        >
          {identita}
        </button>
      ) : (
        <div className="scheda-maniglia scheda-maniglia--ferma">{identita}</div>
      )}

      {!suCarta && (
        <>
          <p className="conteggio">
            {luogo.status === 'symbolic'
              ? 'Luogo simbolico: la curation non lo colloca sulla carta.'
              : 'Nessuna localizzazione proposta: non c’è nulla da collocare.'}
          </p>
          {luogo.candidati.length > 0 && (
            <ul className="candidati">
              {luogo.candidati.map((c) => (
                <RigaCandidato key={c.id} candidato={c} attivo={false} />
              ))}
            </ul>
          )}
          <ElencoFonti fonti={luogo.fonti} dettagli />
          {luogo.da_verificare && <SegnoDaVerificare />}
          {/* Senza popup questo è l'unico posto in cui le note possono stare. */}
          <NoteDelLuogo note={note} />
        </>
      )}

      <p className="scheda-riferimenti">
        {luogo.riferimenti.map((r) => (
          <button key={r} type="button" className="rimando-versetto" onClick={() => onVersetto(r)}>
            {etichettaVersetto(r)}
          </button>
        ))}
      </p>
    </li>
  )
}

/* ---------------------------------------------------------------- popup --- */

/**
 * Il popup non ripete la scheda: dice di quale luogo è questo punto, e mostra
 * **le altre ipotesi** per lo stesso luogo, ciascuna raggiungibile con un click.
 * È il passaggio che la carta da sola non può fare: due marker vicini non
 * dicono se sono due luoghi o due congetture sullo stesso.
 */
function PopupLuogo({
  luogo,
  candidato,
  note,
  onCandidato,
  onChiudi,
}: {
  luogo: Luogo
  candidato: CandidatoLuogo
  note: Nota[]
  onCandidato: (id: string) => void
  onChiudi: () => void
}) {
  // Esc di Leaflet chiude solo quando il fuoco è sulla carta, e qui il fuoco è
  // dentro il popup: la scorciatoia va rifatta dove il fuoco sta davvero.
  return (
    <div
      className="popup-corpo"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onChiudi()
      }}
    >
      {/* `data-fuoco`: è la mappa a portarci il fuoco quando apre il popup, non
          il popup a prenderselo — quando questo nodo si monta è ancora staccato
          dal documento e un focus() qui non avrebbe effetto. */}
      <h2 className="popup-titolo" tabIndex={-1} data-fuoco>
        {nomeLuogo(luogo)}
        {luogo.nomi.he && (
          <>
            {' '}
            <bdi className="lemma" lang="he" dir="rtl">
              {luogo.nomi.he}
            </bdi>
          </>
        )}
      </h2>
      <p className="popup-status">
        <BadgeConfidenza status={luogo.status} />{' '}
        <span className="conteggio">
          {luogo.candidati.length === 1
            ? 'una sola ipotesi di localizzazione'
            : `${luogo.candidati.length} ipotesi concorrenti`}
        </span>
      </p>
      <ul className="candidati">
        {luogo.candidati.map((c) => (
          <RigaCandidato
            key={c.id}
            candidato={c}
            attivo={c.id === candidato.id}
            onSceglie={c.id === candidato.id ? undefined : () => onCandidato(c.id)}
          />
        ))}
      </ul>
      <p className="etichetta">Fonti del luogo</p>
      <ElencoFonti fonti={luogo.fonti} dettagli />
      {luogo.da_verificare && <SegnoDaVerificare />}
      <NoteDelLuogo note={note} />
    </div>
  )
}

/**
 * Le note curate del luogo, con lo stesso apparato del pannello della lettura
 * (`VoceNota`): prospettiva, tipo, confidenza, testo, fonti, `da_verificare`.
 * Anche l'assenza si scrive: qui una nota manca perché nessuno l'ha ancora
 * scritta, ed è un dato sullo stato della curation.
 */
function NoteDelLuogo({ note }: { note: Nota[] }) {
  return (
    <>
      <p className="etichetta">Note curate</p>
      {note.length === 0 ? (
        <p className="vuoto">Nessuna nota curata su questo luogo.</p>
      ) : (
        <ul className="note">
          {note.map((nota) => (
            <VoceNota key={nota.id} nota={nota} />
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Una riga di ipotesi. Espansa solo quando è quella aperta: pro, contro e fonti
 * di undici candidati tutti insieme non sono un apparato, sono un muro.
 */
function RigaCandidato({
  candidato,
  attivo,
  onSceglie,
}: {
  candidato: CandidatoLuogo
  attivo: boolean
  onSceglie?: () => void
}) {
  return (
    <li className={`candidato${attivo ? ' candidato--attivo' : ''}`}>
      <p className="candidato-testa">
        {onSceglie ? (
          <button type="button" className="rimando-note" onClick={onSceglie}>
            {candidato.etichetta}
          </button>
        ) : (
          <span>{candidato.etichetta}</span>
        )}
        {candidato.peso_openbible !== undefined && (
          <span className="conteggio"> · peso OpenBible {candidato.peso_openbible.toFixed(2)}</span>
        )}
      </p>
      {attivo && (
        <>
          {candidato.pro.length > 0 && <ArgomentiCandidato titolo="A favore" voci={candidato.pro} />}
          {candidato.contro.length > 0 && <ArgomentiCandidato titolo="Contro" voci={candidato.contro} />}
          <ElencoFonti fonti={candidato.fonti} dettagli />
        </>
      )}
    </li>
  )
}

function ArgomentiCandidato({ titolo, voci }: { titolo: string; voci: string[] }) {
  return (
    <>
      <p className="etichetta">{titolo}</p>
      <ul className="argomenti">
        {voci.map((v, i) => (
          <li key={`${titolo}-${i}`}>{v}</li>
        ))}
      </ul>
    </>
  )
}
