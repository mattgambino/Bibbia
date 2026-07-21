// src/dati/caricamento.ts — caricamento dei JSON di public/data/ con cache (task F0.4).
//
// La cache è per file (chiave = percorso relativo a data/), quindi per i file
// shardati vale "per libro". In cache va la Promise, non il valore: richieste
// concorrenti dello stesso file condividono un unico fetch; in caso di errore
// la voce si rimuove, così un tentativo successivo può riprovare.

import { z } from 'zod'
import {
  Evento,
  IndiceLemmi,
  LexiconIt,
  LibroParole,
  LibroVersetti,
  Luogo,
  ManifestTraduzioni,
  Persona,
  Traduzione,
} from '../tipi/index.ts'
import type { CodiceLibro } from '../tipi/index.ts'

const cache = new Map<string, Promise<unknown>>()

/**
 * File di dati non installato. Non sempre è un 404: il dev server di Vite — e
 * ogni host configurato per una SPA — risponde 200 con l'index.html a qualunque
 * percorso sconosciuto. Senza il controllo sul content-type l'assenza di un file
 * curato arriverebbe all'utente come "JSON malformato", cioè come un guasto.
 */
export class RisorsaAssente extends Error {}

async function scarica<T>(percorso: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${percorso}`
  const risposta = await fetch(url)
  if (risposta.status === 404) throw new RisorsaAssente(`${url}: HTTP 404`)
  if (!risposta.ok) throw new Error(`${url}: HTTP ${risposta.status}`)
  if (risposta.headers.get('content-type')?.includes('text/html'))
    throw new RisorsaAssente(`${url}: risposta HTML al posto del JSON (file non installato)`)
  const grezzo: unknown = await risposta.json()
  // La conformità agli schemi è già garantita da `npm run valida`; la ri-validazione
  // runtime si fa solo in dev, per non pagare Zod sui file da ~5 MB in produzione.
  if (import.meta.env.DEV) {
    const esito = schema.safeParse(grezzo)
    if (!esito.success) throw new Error(`${url}: dati non conformi allo schema\n${z.prettifyError(esito.error)}`)
    return esito.data
  }
  return grezzo as T
}

/** Carica (o riusa dalla cache) un file di public/data/, validato con lo schema dato. */
export function caricaJson<T>(percorso: string, schema: z.ZodType<T>): Promise<T> {
  const inCache = cache.get(percorso)
  if (inCache) return inCache as Promise<T>
  const promessa = scarica(percorso, schema)
  cache.set(percorso, promessa)
  promessa.catch(() => cache.delete(percorso))
  return promessa
}

export function caricaVersetti(libro: CodiceLibro): Promise<LibroVersetti> {
  return caricaJson(`verses/${libro}.json`, LibroVersetti)
}

export function caricaParole(libro: CodiceLibro): Promise<LibroParole> {
  return caricaJson(`words/${libro}.json`, LibroParole)
}

export function caricaManifestTraduzioni(): Promise<ManifestTraduzioni> {
  return caricaJson('translations/index.json', ManifestTraduzioni)
}

export function caricaTraduzione(id: string): Promise<Traduzione> {
  return caricaJson(`translations/${id}.json`, Traduzione)
}

// L'indice dei lemmi è un file unico (~2 MB) per tutto il Pentateuco: si carica
// alla prima apertura del pannello parola, non all'avvio della vista.
export function caricaIndiceLemmi(): Promise<IndiceLemmi> {
  return caricaJson('indices/lemmi.json', IndiceLemmi)
}

// lexicon_it.json è curato [C] e cresce un range alla volta: finché la bozza di
// bootstrap/ non è stata revisionata e spostata in public/data/, il file non
// esiste. L'assenza non è un errore da mostrare — significa "nessuna glossa
// italiana ancora disponibile" — e si risolve in un lexicon vuoto: il pannello
// mostra allora la sola glossa inglese, come per ogni lemma non ancora curato.
// Ogni altro esito (500, JSON malformato, dati non conformi) resta un errore.
export function caricaLexiconIt(): Promise<LexiconIt> {
  return caricaJson('lexicon_it.json', LexiconIt).catch((e: unknown) => {
    if (e instanceof RisorsaAssente) return {}
    throw e
  })
}

// I file di curation sono liste nude (nessun blocco meta: sono [C], non generati).
export const Eventi = z.array(Evento)
export type Eventi = z.infer<typeof Eventi>
export const Luoghi = z.array(Luogo)
export type Luoghi = z.infer<typeof Luoghi>
export const Persone = z.array(Persona)
export type Persone = z.infer<typeof Persone>

// Stessa regola del lexicon: finché la curation di un file [C] non è stata
// revisionata e spostata da bootstrap/ a public/data/, il file non esiste e
// l'assenza vale "nessun dato curato", non errore. La colonna contesto lo dice a
// chiare lettere, così l'assenza di curation non si confonde con un guasto.
function caricaCurato<T>(percorso: string, schema: z.ZodType<T[]>): Promise<T[]> {
  return caricaJson(percorso, schema).catch((e: unknown) => {
    if (e instanceof RisorsaAssente) return []
    throw e
  })
}

export function caricaEventi(): Promise<Eventi> {
  return caricaCurato('events.json', Eventi)
}

export function caricaLuoghi(): Promise<Luoghi> {
  return caricaCurato('places.json', Luoghi)
}

export function caricaPersone(): Promise<Persone> {
  return caricaCurato('people.json', Persone)
}
