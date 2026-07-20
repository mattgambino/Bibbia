// src/dati/caricamento.ts — caricamento dei JSON di public/data/ con cache (task F0.4).
//
// La cache è per file (chiave = percorso relativo a data/), quindi per i file
// shardati vale "per libro". In cache va la Promise, non il valore: richieste
// concorrenti dello stesso file condividono un unico fetch; in caso di errore
// la voce si rimuove, così un tentativo successivo può riprovare.

import { z } from 'zod'
import { LibroParole, LibroVersetti } from '../tipi/index.ts'
import type { CodiceLibro } from '../tipi/index.ts'

const cache = new Map<string, Promise<unknown>>()

async function scarica<T>(percorso: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${percorso}`
  const risposta = await fetch(url)
  if (!risposta.ok) throw new Error(`${url}: HTTP ${risposta.status}`)
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
