// src/viste/Ricerca.tsx — ricerca a schermo pieno (ROADMAP F5.1, specifica §8).
//
// Stessa impalcatura delle altre viste piene (mappa, timeline, genealogie,
// assistente): apparato a sinistra — campo di ricerca, filtri per categoria,
// conteggi — e i risultati a destra, in tre sezioni. Le tre categorie sono i tre
// modi di entrare nel testo: la parola tradotta (testo delle traduzioni), la
// parola ebraica (lemmi), il nome (entità). Ogni risultato riporta alla lettura.
//
// Tutto gira in memoria sui dati già in cache (nessuna rete a runtime): gli
// indici si costruiscono una volta quando i dati arrivano (useMemo), la query
// filtra indici già normalizzati. L'input è debounced perché a cambiare a ogni
// battuta non è il costo della ricerca ma quello di ridisegnare le liste.

import { useEffect, useMemo, useRef, useState } from 'react'
import { SegnoFuoriPerimetro, SegnoStatus, TagFuoriPerimetro } from '../componenti/Elementi.tsx'
import {
  useEventi,
  useIndiceLemmi,
  useLexiconIt,
  useLuoghi,
  usePersone,
  useTuttiTesti,
} from '../dati/hooks.ts'
import type { Caricamento } from '../dati/hooks.ts'
import {
  MIN_QUERY,
  cercaEntita,
  cercaLemmi,
  cercaTesto,
  costruisciCorpusTesto,
  costruisciIndiceEntita,
  costruisciIndiceLemmi,
  fonteTesto,
} from '../lib/ricerca.ts'
import type { Esito, RisultatoEntita, RisultatoLemma, RisultatoTesto, Snippet } from '../lib/ricerca.ts'
import { etichettaVersetto, versettoDiParola } from '../lib/riferimenti.ts'

type Categoria = 'testo' | 'lemmi' | 'entita'
const ETICHETTA_CATEGORIA: Record<Categoria, string> = {
  testo: 'Testo delle traduzioni',
  lemmi: 'Lemmi ebraici',
  entita: 'Luoghi e persone',
}

// Tetti per categoria: oltre questi si mostra «primi N di M, affina la ricerca».
const LIMITE_TESTO = 60
const LIMITE_LEMMI = 40
const LIMITE_ENTITA = 40

const RITARDO_DEBOUNCE = 160

type Props = {
  /** Query con cui la vista si apre (dal campo nella colonna di navigazione). */
  queryIniziale?: string
  onLettura: () => void
  /** Uscita verso un versetto del testo (risultati di testo ed entità). */
  onVersetto: (versetto: string) => void
  /** Apre la lettura sulla prima occorrenza di un lemma, col pannello parola. */
  onLemma: (parolaId: string) => void
}

export function Ricerca({ queryIniziale = '', onLettura, onVersetto, onLemma }: Props) {
  const [bozza, setBozza] = useState(queryIniziale)
  const [query, setQuery] = useState(queryIniziale.trim())
  const [escluse, setEscluse] = useState<Set<Categoria>>(new Set())
  const campo = useRef<HTMLInputElement>(null)

  const testi = useTuttiTesti(true)
  const indiceLemmi = useIndiceLemmi(true)
  const lexicon = useLexiconIt(true)
  const luoghi = useLuoghi()
  const persone = usePersone()
  // Le pericopi servono solo a sapere quali luoghi la curation ha già ripreso:
  // il perimetro è un fatto di events.json, non un campo dei luoghi.
  const eventi = useEventi()

  // La vista occupa lo schermo e non scorre: senza questo, arrivando da una
  // pagina scorsa a metà, la testata resterebbe sopra il bordo superiore.
  useEffect(() => {
    window.scrollTo(0, 0)
    campo.current?.focus()
  }, [])

  // Debounce: la ricerca è istantanea, ma ridisegnare fino a 140 righe a ogni
  // battuta no. L'invio (submit) scavalca il ritardo.
  useEffect(() => {
    const t = setTimeout(() => setQuery(bozza.trim()), RITARDO_DEBOUNCE)
    return () => clearTimeout(t)
  }, [bozza])

  // Indici costruiti una volta sola quando i dati arrivano.
  const corpus = useMemo(
    () => (testi.stato === 'pronto' ? costruisciCorpusTesto(testi.dati.map(fonteTesto)) : []),
    [testi],
  )
  const indL = useMemo(
    () =>
      indiceLemmi.stato === 'pronto' && lexicon.stato === 'pronto'
        ? costruisciIndiceLemmi(indiceLemmi.dati, lexicon.dati)
        : [],
    [indiceLemmi, lexicon],
  )
  const indE = useMemo(
    () =>
      luoghi.stato === 'pronto' && persone.stato === 'pronto' && eventi.stato === 'pronto'
        ? costruisciIndiceEntita(luoghi.dati, persone.dati, eventi.dati)
        : [],
    [luoghi, persone, eventi],
  )

  const risTesto = useMemo(() => cercaTesto(corpus, query, LIMITE_TESTO), [corpus, query])
  const risLemmi = useMemo(() => cercaLemmi(indL, query, LIMITE_LEMMI), [indL, query])
  const risEntita = useMemo(() => cercaEntita(indE, query, LIMITE_ENTITA), [indE, query])

  const conteggi: Record<Categoria, number> = {
    testo: risTesto.totale,
    lemmi: risLemmi.totale,
    entita: risEntita.totale,
  }
  const totale = conteggi.testo + conteggi.lemmi + conteggi.entita
  const attiva = query.length >= MIN_QUERY

  // Stato di caricamento per categoria: ogni sezione dice per sé se i suoi dati
  // non sono ancora pronti, invece di bloccare la vista intera.
  const statoTesto = statoCategoria(testi)
  const statoLemmi = statoDiTutti(indiceLemmi, lexicon)
  // Anche le pericopi: senza di esse il perimetro non è noto e le entità
  // uscirebbero pronte ma senza la dicitura, cioè con lo status di nuovo esposto.
  const statoEntita = statoDiTutti(luoghi, persone, eventi)

  const mostra = (c: Categoria) => !escluse.has(c)

  return (
    <div className="ricerca-vista">
      <header className="vista-testa">
        <div>
          <p className="marchio">Pentateuco in contesto</p>
          <h1>Ricerca</h1>
        </div>
        <button type="button" className="bottone-ritorno" onClick={onLettura}>
          Torna alla lettura
        </button>
      </header>

      <aside className="vista-apparato" aria-label="Campo di ricerca e filtri">
        <form
          role="search"
          className="ricerca-campo"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(bozza.trim())
          }}
        >
          <label htmlFor="ricerca-input" className="etichetta">
            Cerca nel testo, nei lemmi, nelle entità
          </label>
          <input
            id="ricerca-input"
            ref={campo}
            type="search"
            className="ricerca-input"
            value={bozza}
            onChange={(e) => setBozza(e.target.value)}
            placeholder="Es. acque, mayim, Eufrate…"
            autoComplete="off"
            spellCheck={false}
          />
        </form>

        <fieldset className="filtro">
          <legend>Categorie</legend>
          {(['testo', 'lemmi', 'entita'] as Categoria[]).map((c) => (
            <label key={c} className="filtro-voce">
              <input
                type="checkbox"
                checked={!escluse.has(c)}
                onChange={() => setEscluse((p) => alterna(p, c))}
              />
              <span className="filtro-etichetta">{ETICHETTA_CATEGORIA[c]}</span>
              <span className="conteggio">{attiva ? conteggi[c] : '—'}</span>
            </label>
          ))}
        </fieldset>

        {attiva && (
          <p className="vista-conto" aria-live="polite">
            {totale === 0
              ? 'Nessun risultato'
              : `${totale} ${totale === 1 ? 'risultato' : 'risultati'} in tutto`}
            {' per '}
            <span className="ricerca-eco">«{query}»</span>
          </p>
        )}

        <p className="vista-nota">
          Il testo è quello delle traduzioni installate; i lemmi vengono
          dall'indice ebraico con le glosse italiane dove ci sono; le entità sono
          tutti i luoghi e le persone del dataset, anche quelli che la curation non
          ha ancora ripreso. Ogni risultato apre il testo sul punto giusto.
        </p>
      </aside>

      <main className="ricerca-scena">
        {/* L'invito si ferma alla traslitterazione di proposito: una forma ebraica qui
            sarebbe una stringa scritta a mano fuori dal database (regola 1 di CLAUDE.md),
            e per giunta proprio dove indices/lemmi.json rende H4325 troncato (ROADMAP
            F5.1) — cioè un esempio che smentirebbe il dato. */}
        {!attiva ? (
          <p className="ricerca-invito">
            Digita almeno {MIN_QUERY} caratteri. La ricerca ignora accenti, vocali
            e segni di cantillazione: <em>acque</em>, <em>mayim</em> e la parola
            ebraica corrispondente portano allo stesso posto.
          </p>
        ) : totale === 0 && statoTesto.stato === 'pronto' && statoLemmi.stato === 'pronto' && statoEntita.stato === 'pronto' ? (
          <p className="vuoto">
            Nessun risultato per «{query}». Prova un'altra forma della parola, o cerca
            per traslitterazione o per nome.
          </p>
        ) : (
          <>
            {mostra('testo') && (
              <SezioneCategoria titolo={ETICHETTA_CATEGORIA.testo} esito={risTesto} limite={LIMITE_TESTO} stato={statoTesto}>
                <ul className="ricerca-risultati">
                  {risTesto.risultati.map((r) => (
                    <RigaTesto key={r.chiave} r={r} onVersetto={onVersetto} multi={testiInstallati(testi) > 1} />
                  ))}
                </ul>
              </SezioneCategoria>
            )}

            {mostra('lemmi') && (
              <SezioneCategoria titolo={ETICHETTA_CATEGORIA.lemmi} esito={risLemmi} limite={LIMITE_LEMMI} stato={statoLemmi}>
                <ul className="ricerca-risultati">
                  {risLemmi.risultati.map((r) => (
                    <RigaLemma key={r.dStrong} r={r} onLemma={onLemma} />
                  ))}
                </ul>
              </SezioneCategoria>
            )}

            {mostra('entita') && (
              <SezioneCategoria titolo={ETICHETTA_CATEGORIA.entita} esito={risEntita} limite={LIMITE_ENTITA} stato={statoEntita}>
                <ul className="ricerca-risultati">
                  {risEntita.risultati.map((r) => (
                    <RigaEntita key={`${r.tipo}-${r.id}`} r={r} onVersetto={onVersetto} />
                  ))}
                </ul>
              </SezioneCategoria>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function alterna<T>(insieme: Set<T>, valore: T): Set<T> {
  const nuovo = new Set(insieme)
  if (nuovo.has(valore)) nuovo.delete(valore)
  else nuovo.add(valore)
  return nuovo
}

/** Numero di traduzioni installate (per decidere se etichettare la fonte). */
function testiInstallati(testi: Caricamento<unknown[]>): number {
  return testi.stato === 'pronto' ? testi.dati.length : 0
}

/** Riduce lo stato di un caricamento a ciò che la sezione deve dire. */
function statoCategoria<T>(c: Caricamento<T>): { stato: 'in_corso' | 'pronto' | 'errore'; messaggio?: string } {
  if (c.stato === 'errore') return { stato: 'errore', messaggio: c.messaggio }
  return { stato: c.stato }
}

/** Come sopra ma per due caricamenti che devono essere pronti entrambi. */
/** Pronto solo quando lo sono tutti; il primo errore vince e porta il suo messaggio. */
function statoDiTutti(
  ...caricamenti: Caricamento<unknown>[]
): { stato: 'in_corso' | 'pronto' | 'errore'; messaggio?: string } {
  const rotto = caricamenti.find((c) => c.stato === 'errore')
  if (rotto && rotto.stato === 'errore') return { stato: 'errore', messaggio: rotto.messaggio }
  if (caricamenti.some((c) => c.stato === 'in_corso')) return { stato: 'in_corso' }
  return { stato: 'pronto' }
}

/* ------------------------------------------------------------- una sezione --- */

function SezioneCategoria({
  titolo,
  esito,
  limite,
  stato,
  children,
}: {
  titolo: string
  esito: Esito<unknown>
  limite: number
  stato: { stato: 'in_corso' | 'pronto' | 'errore'; messaggio?: string }
  children: React.ReactNode
}) {
  return (
    <section className="ricerca-sezione" aria-label={titolo}>
      <h2 className="ricerca-sezione-testa">
        {titolo}
        <span className="conteggio">
          {stato.stato === 'pronto'
            ? esito.totale > limite
              ? `primi ${limite} di ${esito.totale}`
              : esito.totale
            : ''}
        </span>
      </h2>
      {stato.stato === 'errore' ? (
        <p className="stato-errore" role="alert">
          Dati non caricati: {stato.messaggio}
        </p>
      ) : stato.stato === 'in_corso' ? (
        <p className="stato-caricamento">Caricamento…</p>
      ) : esito.totale === 0 ? (
        <p className="vuoto">Nessun risultato in questa categoria.</p>
      ) : (
        children
      )}
    </section>
  )
}

/* -------------------------------------------------------------- le righe --- */

function TestoSnippet({ snippet }: { snippet: Snippet }) {
  return (
    <span className="ricerca-snippet">
      {snippet.troncatoInizio && '… '}
      {snippet.pre}
      <mark className="ricerca-hit">{snippet.hit}</mark>
      {snippet.post}
      {snippet.troncatoFine && ' …'}
    </span>
  )
}

function RigaTesto({
  r,
  onVersetto,
  multi,
}: {
  r: RisultatoTesto
  onVersetto: (v: string) => void
  multi: boolean
}) {
  return (
    <li className="ricerca-riga ricerca-riga-testo">
      <button type="button" className="rimando-versetto" onClick={() => onVersetto(r.versetto)}>
        {r.etichetta}
      </button>
      {multi && <span className="ricerca-tag">{r.traduzioneNome}</span>}
      <TestoSnippet snippet={r.snippet} />
    </li>
  )
}

/**
 * Il lemma è un bersaglio unico: aprire la sua prima occorrenza porta al pannello
 * parola, che elenca poi tutte le occorrenze nel Pentateuco. La glossa mostrata è
 * l'italiano curato dove c'è (etichettato, e con il tratto «da verificare» finché
 * il lemma non è stato controllato), altrimenti l'inglese di TAHOT.
 */
function RigaLemma({ r, onLemma }: { r: RisultatoLemma; onLemma: (parolaId: string) => void }) {
  const corpo = (
    <>
      <span className="ricerca-lemma-testa">
        <span className="lemma" lang="he" dir="rtl">
          <bdi>{r.lemma}</bdi>
        </span>
        <span className="translit">{r.translit}</span>
      </span>
      <span className="ricerca-lemma-glossa">
        <span className="etichetta-inline">glossa {r.glossaLingua === 'it' ? 'IT' : 'EN'}</span>{' '}
        <span className={r.daVerificare ? 'da-verificare' : undefined}>{r.glossa}</span>
        {r.daVerificare && <span className="solo-lettore-schermo"> (da verificare)</span>}
      </span>
      <span className="conteggio">
        {r.occorrenze} {r.occorrenze === 1 ? 'occorrenza' : 'occorrenze'} nel Pentateuco
        {r.prima ? ` · apre ${etichettaVersetto(versettoDiParola(r.prima))}` : ''}
      </span>
    </>
  )
  return (
    <li className="ricerca-riga ricerca-riga-lemma">
      {r.prima ? (
        <button type="button" className="ricerca-maniglia" onClick={() => onLemma(r.prima!)}>
          {corpo}
        </button>
      ) : (
        <div className="ricerca-maniglia ricerca-maniglia--ferma">{corpo}</div>
      )}
    </li>
  )
}

function RigaEntita({ r, onVersetto }: { r: RisultatoEntita; onVersetto: (v: string) => void }) {
  const identita = (
    <span className="ricerca-entita-testa">
      <span className="ricerca-tag">{r.tipo === 'luogo' ? 'luogo' : 'persona'}</span>
      {/* Lo status compare solo se qualcuno l'ha assegnato: fuori dal perimetro
          della curation al suo posto va la dicitura per esteso, non un segno più
          pallido — attenuare direbbe «giudizio debole», non «giudizio assente». */}
      {r.fuoriPerimetro ? (
        <>
          <SegnoFuoriPerimetro />
          <TagFuoriPerimetro />
        </>
      ) : (
        r.status && <SegnoStatus status={r.status} />
      )}
      <span className="ricerca-entita-nome">{r.nome}</span>
      {r.he && (
        <bdi className="lemma" lang="he" dir="rtl">
          {r.he}
        </bdi>
      )}
      {r.translit && r.nome !== r.translit && <span className="translit">{r.translit}</span>}
    </span>
  )
  return (
    <li className="ricerca-riga ricerca-riga-entita">
      {r.primoRiferimento ? (
        <button
          type="button"
          className="ricerca-maniglia"
          onClick={() => onVersetto(r.primoRiferimento!)}
        >
          {identita}
          <span className="conteggio">apre {etichettaVersetto(r.primoRiferimento)}</span>
        </button>
      ) : (
        <div className="ricerca-maniglia ricerca-maniglia--ferma">
          {identita}
          <span className="conteggio">Nessun riferimento nel testo.</span>
        </div>
      )}
    </li>
  )
}
