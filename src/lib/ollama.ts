// src/lib/ollama.ts — client del server Ollama locale (ROADMAP F4.2, specifica §9).
//
// L'assistente parla solo con Ollama in locale: nessun servizio remoto, nessuna
// chiave. Tre operazioni: verificare che risponda ed elencare i modelli, calcolare
// l'embedding di una domanda, generare una risposta in streaming.
//
// CORS (il punto delicato). Le richieste partono dal browser verso
// http://localhost:11434, che è un'ALTRA origine rispetto all'app: Ollama deve
// dichiararla lecita via la variabile d'ambiente OLLAMA_ORIGINS, altrimenti il
// browser blocca la risposta. Dal lato JavaScript un blocco CORS e un server spento
// sono indistinguibili — entrambi arrivano come un `TypeError` di fetch — quindi il
// messaggio di errore copre i due casi insieme (vedi la vista Assistente).

/** Base URL del server Ollama. Sovrascrivibile per chi lo espone altrove. */
export const OLLAMA_BASE =
  (typeof localStorage !== 'undefined' && localStorage.getItem('ollama-base')) || 'http://localhost:11434'

export type ModelloOllama = { nome: string }

export type EsitoVerifica =
  | { ok: true; modelli: ModelloOllama[] }
  | { ok: false; motivo: string }

/** GET /api/tags: elenca i modelli installati. Serve anche da ping di disponibilità. */
export async function verificaOllama(base = OLLAMA_BASE): Promise<EsitoVerifica> {
  let risposta: Response
  try {
    risposta = await fetch(`${base}/api/tags`)
  } catch {
    // TypeError di fetch: server spento oppure origine non ammessa da OLLAMA_ORIGINS.
    return { ok: false, motivo: 'non-raggiungibile' }
  }
  if (!risposta.ok) return { ok: false, motivo: `HTTP ${risposta.status}` }
  const dati = (await risposta.json()) as { models?: { name?: string }[] }
  const modelli = (dati.models ?? [])
    .map((m) => ({ nome: m.name ?? '' }))
    .filter((m) => m.nome !== '')
  return { ok: true, modelli }
}

/** POST /api/embed: vettore di embedding di un testo, con il modello dato (lo stesso
 *  con cui è stato generato embeddings.json, altrimenti gli spazi non combaciano). */
export async function embeddingQuery(modello: string, testo: string, base = OLLAMA_BASE): Promise<number[]> {
  const risposta = await fetch(`${base}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modello, input: testo }),
  })
  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => '')
    if (risposta.status === 404 || /not found|try pulling/i.test(corpo))
      throw new Error(`Il modello di embedding "${modello}" non è installato in Ollama (ollama pull ${modello}).`)
    throw new Error(`Ollama /api/embed ha risposto ${risposta.status}.`)
  }
  const dati = (await risposta.json()) as { embeddings?: number[][]; embedding?: number[] }
  const vettore = dati.embeddings?.[0] ?? dati.embedding
  if (!Array.isArray(vettore)) throw new Error('Risposta di embedding senza vettore.')
  return vettore
}

export type MessaggioChat = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * POST /api/chat in streaming. Richiama `onToken` a ogni frammento di testo e
 * restituisce la risposta completa. `think: false` disattiva il ragionamento dei
 * modelli che lo prevedono (qwen3…); per prudenza si scartano anche eventuali
 * blocchi <think>…</think> che qualche modello emette comunque nel contenuto.
 */
export async function generaChat(
  modello: string,
  messaggi: MessaggioChat[],
  opzioni: { onToken?: (frammento: string) => void; segnale?: AbortSignal; base?: string } = {},
): Promise<string> {
  const { onToken, segnale, base = OLLAMA_BASE } = opzioni
  const risposta = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modello, messages: messaggi, stream: true, think: false, options: { temperature: 0 } }),
    signal: segnale,
  })
  if (!risposta.ok || !risposta.body) {
    const corpo = await risposta.text().catch(() => '')
    if (risposta.status === 404 || /not found|try pulling/i.test(corpo))
      throw new Error(`Il modello "${modello}" non è installato in Ollama (ollama pull ${modello}).`)
    throw new Error(`Ollama /api/chat ha risposto ${risposta.status}.`)
  }

  const lettore = risposta.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completa = ''
  let dentroThink = false

  // Rimuove i blocchi <think>…</think> a cavallo dei frammenti, senza mai passarli
  // a onToken. Ritorna solo il testo "visibile".
  const ripulisci = (frammento: string): string => {
    let visibile = ''
    let resto = frammento
    while (resto.length > 0) {
      if (dentroThink) {
        const fine = resto.indexOf('</think>')
        if (fine === -1) return visibile
        resto = resto.slice(fine + '</think>'.length)
        dentroThink = false
      } else {
        const inizio = resto.indexOf('<think>')
        if (inizio === -1) return visibile + resto
        visibile += resto.slice(0, inizio)
        resto = resto.slice(inizio + '<think>'.length)
        dentroThink = true
      }
    }
    return visibile
  }

  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let a: number
    while ((a = buffer.indexOf('\n')) !== -1) {
      const riga = buffer.slice(0, a).trim()
      buffer = buffer.slice(a + 1)
      if (riga === '') continue
      let oggetto: { message?: { content?: string }; done?: boolean; error?: string }
      try {
        oggetto = JSON.parse(riga)
      } catch {
        continue
      }
      if (oggetto.error) throw new Error(`Ollama: ${oggetto.error}`)
      const pezzo = oggetto.message?.content ?? ''
      if (pezzo) {
        const visibile = ripulisci(pezzo)
        if (visibile) {
          completa += visibile
          onToken?.(visibile)
        }
      }
    }
  }
  return completa
}
