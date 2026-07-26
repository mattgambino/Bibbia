// src/viste/Assistente.tsx — modulo assistente RAG (ROADMAP F4.2–F4.3, specifica §9).
//
// Pannello separato dalla lettura, attivo solo se Ollama risponde in locale. Il
// giro è: la domanda diventa un embedding (stesso modello di embeddings.json),
// si recuperano i top-k tra versetti letterali e note curate, si passa il contesto
// a Ollama con il system prompt del §9 e si mostra la risposta in streaming.
//
// Guardrail (F4.3): a risposta conclusa il testo passa da `analizzaRisposta`, che
// ricostruisce ogni riferimento [..] dal dataset. Il modello non è mai la fonte del
// testo biblico — i versetti citati compaiono dal database; i riferimenti verificati
// sono cliccabili; quelli non verificati (inventati o fuori dal contesto recuperato)
// sono segnalati con un avviso evidente. Il banner "sintesi automatica" è permanente.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmbeddings, useIdVersetti, useNote, useTraduzione } from '../dati/hooks.ts'
import {
  OLLAMA_BASE,
  embeddingQuery,
  generaChat,
  verificaOllama,
  type ModelloOllama,
} from '../lib/ollama.ts'
import {
  TOP_K,
  analizzaRisposta,
  costruisciContesto,
  messaggiChat,
  recupera,
  type EsitoRif,
  type Fonte,
  type SegmentoRif,
} from '../lib/rag.ts'

/**
 * Come si dice all'utente un riferimento non verificato. Tre casi distinti, tutti
 * bloccati allo stesso modo: quello che cambia è solo l'affermazione che si fa.
 * `non-curato` esiste perché dire «inesistente nel dataset» di un versetto che il
 * dataset contiene, e che è raggiungibile nella vista lettura, sarebbe falso.
 */
const DICITURA_ANOMALIA: Partial<Record<EsitoRif, { breve: string; estesa: string }>> = {
  'fuori-contesto': { breve: 'fuori dal contesto', estesa: 'fuori dal contesto recuperato' },
  'non-curato': { breve: 'senza testo curato', estesa: 'nel dataset, ma senza testo curato da citare' },
  inesistente: { breve: 'inesistente', estesa: 'inesistente nel dataset' },
}

const dicituraAnomalia = (esito: EsitoRif) =>
  DICITURA_ANOMALIA[esito] ?? { breve: 'non verificato', estesa: 'non verificato' }

type Props = {
  onLettura: () => void
  /** Uscita verso un versetto del testo (usato dai riferimenti recuperati). */
  onVersetto: (versetto: string) => void
}

/** Stato del ping a Ollama: finché non si sa, il pannello non offre la casella. */
type StatoOllama =
  | { fase: 'verifica' }
  | { fase: 'assente' }
  | { fase: 'pronto'; modelli: ModelloOllama[] }
  | { fase: 'errore'; messaggio: string }

/** Stato di una interrogazione in corso o conclusa. */
type Conversazione =
  | { fase: 'vuoto' }
  | { fase: 'recupero'; domanda: string }
  | { fase: 'generazione'; domanda: string; risposta: string; fonti: Fonte[] }
  | { fase: 'fatto'; domanda: string; risposta: string; fonti: Fonte[] }
  | { fase: 'errore'; domanda: string; messaggio: string }

/** "bge-m3" e "bge-m3:latest" sono lo stesso modello: si confrontano i nomi con il
 *  tag esplicitato, così il modello di embedding non ricompare tra i generativi. */
function stessoModello(a: string, b: string): boolean {
  const conTag = (n: string) => (n.includes(':') ? n : `${n}:latest`)
  return conTag(a) === conTag(b)
}

/** I modelli utilizzabili per la generazione: tutti quelli installati tranne quello
 *  di embedding (che non genera testo). */
function modelliGenerazione(modelli: ModelloOllama[], modelloEmbedding: string): string[] {
  return modelli.map((m) => m.nome).filter((n) => !stessoModello(n, modelloEmbedding))
}

/** Modello di generazione scelto dall'utente, ricordato tra le sessioni
 *  (preferenza utente in localStorage, come traduzione e posizione di lettura). */
const CHIAVE_MODELLO = 'assistente-modello-gen'
function modelloSalvato(): string | null {
  try {
    return localStorage.getItem(CHIAVE_MODELLO)
  } catch {
    return null
  }
}
function salvaModello(nome: string): void {
  try {
    localStorage.setItem(CHIAVE_MODELLO, nome)
  } catch {
    // localStorage non disponibile (modalità privata rigida): si prosegue senza ricordare.
  }
}

/** Il modello da selezionare all'apertura: quello salvato dall'utente se è ancora
 *  installato, altrimenti un default ragionevole (generalisti noti del §9, poi il
 *  primo utile). */
function modelloIniziale(modelli: ModelloOllama[], modelloEmbedding: string): string {
  const generativi = modelliGenerazione(modelli, modelloEmbedding)
  const salvato = modelloSalvato()
  if (salvato && generativi.some((n) => stessoModello(n, salvato))) {
    return generativi.find((n) => stessoModello(n, salvato)) ?? salvato
  }
  const preferito = generativi.find((n) => /qwen|llama|gemma|mistral|phi/i.test(n))
  return preferito ?? generativi[0] ?? ''
}

export function Assistente({ onLettura, onVersetto }: Props) {
  const embeddings = useEmbeddings(true)
  const note = useNote()
  const letterale = useTraduzione('letterale')
  // Serve alla post-verifica per distinguere un riferimento inventato da uno reale
  // ma privo di testo curato (v. `EsitoRif` in lib/rag.ts).
  const idVersetti = useIdVersetti(true)

  const [ollama, setOllama] = useState<StatoOllama>({ fase: 'verifica' })
  const [modelloGen, setModelloGen] = useState<string>('')
  const [bozza, setBozza] = useState('')
  const [conv, setConv] = useState<Conversazione>({ fase: 'vuoto' })
  const annulla = useRef<AbortController | null>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Ping a Ollama all'apertura. Il modello di embedding lo detta embeddings.json,
  // quindi il modello di generazione predefinito si sceglie solo quando entrambi
  // (tags di Ollama e meta degli embeddings) sono noti.
  const modelloEmbedding = embeddings.stato === 'pronto' ? embeddings.dati.meta.modello : ''
  useEffect(() => {
    let vivo = true
    verificaOllama().then((esito) => {
      if (!vivo) return
      if (!esito.ok) setOllama(esito.motivo === 'non-raggiungibile' ? { fase: 'assente' } : { fase: 'errore', messaggio: esito.motivo })
      else setOllama({ fase: 'pronto', modelli: esito.modelli })
    })
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (ollama.fase === 'pronto' && modelloGen === '' && modelloEmbedding !== '') {
      setModelloGen(modelloIniziale(ollama.modelli, modelloEmbedding))
    }
  }, [ollama, modelloGen, modelloEmbedding])

  // Cambiare modello lo ricorda per le prossime sessioni.
  const scegliModello = (nome: string) => {
    setModelloGen(nome)
    salvaModello(nome)
  }

  // Indici per risolvere i testi dal database quando si costruisce il contesto.
  const testoVersetto = useMemo(() => {
    const testi = letterale.stato === 'pronto' ? letterale.dati.testi : {}
    return (ref: string) => testi[ref]
  }, [letterale])
  const notaPerId = useMemo(() => {
    const mappa = new Map<string, { titolo: string; testo: string }>()
    if (note.stato === 'pronto') for (const n of note.dati) mappa.set(n.id, { titolo: n.titolo, testo: n.testo })
    return (id: string) => mappa.get(id)
  }, [note])
  // Finché l'elenco non è caricato la risposta è `false`, cioè l'esito più prudente
  // (`inesistente`): non si promuove mai un riferimento per un dato che non c'è.
  const versettoEsiste = useMemo(() => {
    const ids = idVersetti.stato === 'pronto' ? idVersetti.dati : new Set<string>()
    return (id: string) => ids.has(id)
  }, [idVersetti])

  const datiPronti = embeddings.stato === 'pronto' && note.stato === 'pronto' && letterale.stato === 'pronto'

  // embeddings.json assente (curation non ancora embeddata) si riconosce dal
  // messaggio: il loader lo segnala come 404 o risposta HTML del dev server SPA.
  const embeddingsAssenti =
    embeddings.stato === 'errore' && /404|non installat|HTML|html/i.test(embeddings.messaggio)

  const chiedi = async () => {
    const domanda = bozza.trim()
    if (domanda === '' || !datiPronti || ollama.fase !== 'pronto' || modelloGen === '') return
    if (embeddings.stato !== 'pronto') return

    annulla.current?.abort()
    const controller = new AbortController()
    annulla.current = controller

    setConv({ fase: 'recupero', domanda })
    try {
      const vettore = await embeddingQuery(modelloEmbedding, domanda)
      const recuperate = recupera(embeddings.dati, vettore, TOP_K)
      const { blocco, fonti } = costruisciContesto(recuperate, { testoVersetto, nota: notaPerId })

      if (blocco === '') {
        setConv({ fase: 'errore', domanda, messaggio: 'Nessun passo curato è risultato pertinente alla domanda.' })
        return
      }

      setConv({ fase: 'generazione', domanda, risposta: '', fonti })
      const testo = await generaChat(modelloGen, messaggiChat(blocco, domanda), {
        segnale: controller.signal,
        onToken: (frammento) =>
          setConv((c) => (c.fase === 'generazione' ? { ...c, risposta: c.risposta + frammento } : c)),
      })
      setConv((c) => (c.fase === 'generazione' ? { fase: 'fatto', domanda, risposta: testo, fonti: c.fonti } : c))
    } catch (e) {
      if (controller.signal.aborted) return // annullamento volontario: nessun errore da mostrare
      setConv({ fase: 'errore', domanda, messaggio: e instanceof Error ? e.message : String(e) })
    } finally {
      if (annulla.current === controller) annulla.current = null
    }
  }

  const inCorso = conv.fase === 'recupero' || conv.fase === 'generazione'
  const modelliGenerativi =
    ollama.fase === 'pronto' ? modelliGenerazione(ollama.modelli, modelloEmbedding) : []

  return (
    <div className="assistente-vista">
      <header className="vista-testa">
        <div>
          <p className="marchio">Pentateuco in contesto</p>
          <h1>Assistente</h1>
        </div>
        <button type="button" className="bottone-ritorno" onClick={onLettura}>
          Torna alla lettura
        </button>
      </header>

      <aside className="vista-apparato" aria-label="Impostazioni e fonti dell'assistente">
        <p className="assistente-ambito">
          Risponde <strong>solo</strong> sul materiale curato — al momento Genesi 1–11. Fuori da lì
          dichiara di non avere materiale: è il comportamento voluto, non un limite da forzare.
        </p>

        {ollama.fase === 'pronto' && modelliGenerativi.length > 0 && (
          <div className="assistente-modello">
            <label htmlFor="modello-generazione" className="etichetta">
              Modello di generazione
            </label>
            <select
              id="modello-generazione"
              className="selettore"
              value={modelloGen}
              onChange={(e) => scegliModello(e.target.value)}
              disabled={inCorso}
            >
              {modelliGenerativi.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {modelloEmbedding && (
              <p className="assistente-nota-modello">
                Embedding: <code>{modelloEmbedding}</code> (fisso, deciso in fase di generazione dei
                vettori).
              </p>
            )}
          </div>
        )}

        {(conv.fase === 'generazione' || conv.fase === 'fatto') && conv.fonti.length > 0 && (
          <section className="assistente-fonti">
            <p className="etichetta">Passi recuperati ({conv.fonti.length})</p>
            <ul className="assistente-fonti-elenco">
              {conv.fonti.map((f) => (
                <li key={`${f.tipo}-${f.ref}`}>
                  {f.tipo === 'versetto' ? (
                    <button type="button" className="rimando-versetto" onClick={() => onVersetto(f.ref)}>
                      {f.etichetta}
                    </button>
                  ) : (
                    <span className="assistente-fonte-nota">
                      <span className="assistente-fonte-sigla" aria-hidden="true">
                        nota
                      </span>{' '}
                      {f.titolo}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="vista-nota">
              Sono i passi che l'assistente ha usato per rispondere. Nella risposta ogni riferimento
              è ricondotto a questi passi: i versetti citati portano il testo dal database, i
              riferimenti non verificati sono segnalati.
            </p>
          </section>
        )}
      </aside>

      <main className="assistente-scena">
        {embeddingsAssenti ? (
          <p className="stato-errore" role="alert">
            embeddings.json non è in public/data/. Generarlo con lo script degli embeddings (F4.1)
            prima di usare l'assistente.
          </p>
        ) : embeddings.stato === 'errore' ? (
          <p className="stato-errore" role="alert">
            Vettori non caricati: {embeddings.messaggio}
          </p>
        ) : ollama.fase === 'verifica' || embeddings.stato === 'in_corso' ? (
          <p className="stato-caricamento">Verifica di Ollama e caricamento dei vettori…</p>
        ) : ollama.fase === 'assente' || ollama.fase === 'errore' ? (
          <OllamaAssente stato={ollama} />
        ) : (
          <>
            {/* Banner permanente (§9): resta visibile anche prima di chiedere. */}
            <p className="assistente-avviso assistente-avviso-fisso" role="note">
              Sintesi automatica — verifica le fonti citate. I versetti mostrati vengono dal testo
              del database, non dal modello; i riferimenti non verificati sono segnalati.
            </p>

            <form
              className="assistente-form"
              onSubmit={(e) => {
                e.preventDefault()
                void chiedi()
              }}
            >
              <label htmlFor="assistente-domanda" className="etichetta">
                La tua domanda
              </label>
              <textarea
                id="assistente-domanda"
                className="assistente-input"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder="Es. Chi sono i Nefilim secondo il testo e le note?"
                rows={3}
                // Invio per inviare; Maiusc+Invio per andare a capo.
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void chiedi()
                  }
                }}
              />
              <div className="assistente-azioni">
                {inCorso ? (
                  <button
                    type="button"
                    className="bottone-ritorno"
                    onClick={() => annulla.current?.abort()}
                  >
                    Ferma
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="assistente-invia"
                    disabled={bozza.trim() === '' || !datiPronti || modelloGen === ''}
                  >
                    Chiedi
                  </button>
                )}
              </div>
            </form>

            {conv.fase !== 'vuoto' && (
              <section className="assistente-risposta" aria-live="polite">
                <p className="assistente-domanda-eco">{conv.domanda}</p>

                {conv.fase === 'recupero' && (
                  <p className="stato-caricamento">Recupero dei passi curati…</p>
                )}

                {conv.fase === 'errore' ? (
                  <p className="stato-errore" role="alert">
                    {conv.messaggio}
                  </p>
                ) : conv.fase === 'generazione' ? (
                  // Durante lo streaming il testo è ancora incompleto: si mostra grezzo,
                  // la verifica dei riferimenti scatta a risposta conclusa.
                  <div className="assistente-testo">
                    {conv.risposta}
                    <span className="assistente-cursore" aria-hidden="true" />
                  </div>
                ) : conv.fase === 'fatto' ? (
                  <RispostaVerificata
                    risposta={conv.risposta}
                    fonti={conv.fonti}
                    testoVersetto={testoVersetto}
                    nota={notaPerId}
                    versettoEsiste={versettoEsiste}
                    onVersetto={onVersetto}
                  />
                ) : null}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/* --------------------------------------------------- Risposta verificata -------- */

/**
 * La risposta a valle del guardrail: il testo del modello scomposto in segmenti,
 * con i riferimenti ricondotti al dataset. I versetti citati portano il testo dal
 * database (mai dal modello), le note aprono in linea il proprio testo, i riferimenti
 * non verificati sono marcati e riepilogati in cima con un avviso evidente.
 */
function RispostaVerificata({
  risposta,
  fonti,
  testoVersetto,
  nota,
  versettoEsiste,
  onVersetto,
}: {
  risposta: string
  fonti: Fonte[]
  testoVersetto: (ref: string) => string | undefined
  nota: (id: string) => { titolo: string; testo: string } | undefined
  versettoEsiste: (id: string) => boolean
  onVersetto: (versetto: string) => void
}) {
  const { segmenti, anomalie } = useMemo(
    () => analizzaRisposta(risposta, { fonti, testoVersetto, nota, versettoEsiste }),
    [risposta, fonti, testoVersetto, nota, versettoEsiste],
  )

  return (
    <>
      {anomalie.length > 0 && (
        <p className="assistente-allarme" role="alert">
          {anomalie.length === 1
            ? '1 riferimento nella risposta non è verificabile nel materiale recuperato'
            : `${anomalie.length} riferimenti nella risposta non sono verificabili nel materiale recuperato`}
          {' ('}
          {anomalie.map((a, i) => (
            <span key={`${a.ref}-${i}`}>
              {i > 0 && ', '}
              <span className="assistente-allarme-rif">[{a.etichetta}]</span>
              {` — ${dicituraAnomalia(a.esito).breve}`}
            </span>
          ))}
          {'). '}
          Trattali con cautela: non provengono dai passi curati.
        </p>
      )}

      <div className="assistente-testo">
        {segmenti.map((s, i) =>
          s.tipo === 'testo' ? (
            <span key={i}>{s.testo}</span>
          ) : (
            <RiferimentoInline key={i} seg={s} onVersetto={onVersetto} />
          ),
        )}
      </div>
    </>
  )
}

/** Un singolo riferimento in linea, reso secondo l'esito della verifica. */
function RiferimentoInline({ seg, onVersetto }: { seg: SegmentoRif; onVersetto: (v: string) => void }) {
  if (seg.esito === 'versetto') {
    return (
      <>
        <button
          type="button"
          className="rif-inline rif-verso"
          onClick={() => onVersetto(seg.ref)}
          title="Apri nel testo"
        >
          {seg.etichetta}
        </button>
        {seg.primaOccorrenza && seg.versettoTesto && (
          <span className="rif-verso-testo">
            {' '}
            «{seg.versettoTesto}»<span className="solo-lettore-schermo"> (testo dal database)</span>
          </span>
        )}
      </>
    )
  }

  if (seg.esito === 'nota') return <NotaInline seg={seg} />

  // fuori-contesto / non-curato / inesistente: si segnala, non si nasconde.
  return (
    <mark className="rif-inline rif-guasto" title={`Riferimento non verificato: ${dicituraAnomalia(seg.esito).estesa}`}>
      [{seg.etichetta}]
      <span className="solo-lettore-schermo">
        {' '}
        riferimento non verificato: {dicituraAnomalia(seg.esito).estesa}
      </span>
    </mark>
  )
}

/** Una nota citata: chip che apre in linea il proprio testo (dal database). */
function NotaInline({ seg }: { seg: SegmentoRif }) {
  const [aperta, setAperta] = useState(false)
  return (
    <>
      <button
        type="button"
        className="rif-inline rif-nota"
        onClick={() => setAperta((v) => !v)}
        aria-expanded={aperta}
        title={aperta ? 'Chiudi la nota' : 'Apri la nota'}
      >
        <span className="rif-nota-sigla" aria-hidden="true">
          nota
        </span>{' '}
        {seg.notaTitolo ?? seg.ref}
      </button>
      {aperta && seg.notaTesto && <span className="rif-nota-testo">{seg.notaTesto}</span>}
    </>
  )
}

/* --------------------------------------------------- Ollama non raggiungibile --- */

/**
 * Stato disattivato con le istruzioni per il CORS: dal browser un server spento e
 * un'origine non ammessa danno lo stesso errore, quindi si spiegano entrambi. Il
 * comando include l'origine reale di questa pagina, quella che OLLAMA_ORIGINS deve
 * elencare.
 */
function OllamaAssente({ stato }: { stato: { fase: 'assente' } | { fase: 'errore'; messaggio: string } }) {
  const origine = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  return (
    <div className="assistente-offline">
      <h2>Ollama non raggiungibile</h2>
      {stato.fase === 'errore' ? (
        <p>Ollama ha risposto in modo inatteso ({stato.messaggio}).</p>
      ) : (
        <p>
          L'assistente parla con un modello locale via Ollama, su <code>{OLLAMA_BASE}</code>. Non
          risponde: o non è in esecuzione, o non autorizza le richieste da questa pagina.
        </p>
      )}
      <ol className="assistente-passi">
        <li>
          Installa e avvia Ollama (<code>ollama serve</code>).
        </li>
        <li>
          Scarica i modelli: quello di embedding <code>bge-m3</code> e uno di generazione (es.{' '}
          <code>ollama pull qwen2.5:14b</code> o <code>llama3.1:8b</code>).
        </li>
        <li>
          Autorizza questa origine per il CORS impostando <code>OLLAMA_ORIGINS</code> e riavviando
          Ollama:
          <pre className="assistente-comando">
            <code>{`setx OLLAMA_ORIGINS "${origine}"`}</code>
          </pre>
          <span className="assistente-nota-modello">
            Su Windows con <code>setx</code> la variabile vale dalle sessioni successive: chiudi e
            riapri il terminale (o usa <code>$env:OLLAMA_ORIGINS</code> in PowerShell per la sessione
            corrente), poi riavvia Ollama. Più origini si separano con la virgola; <code>*</code>{' '}
            ammette tutto, comodo solo in sviluppo.
          </span>
        </li>
      </ol>
    </div>
  )
}
