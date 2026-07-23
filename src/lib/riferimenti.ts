// src/lib/riferimenti.ts — lettura e formattazione degli id di SCHEMI-DATI.md §1.
//
// Gli id sono l'unica chiave che lega parole, versetti, traduzioni e rimandi:
// qui stanno le poche funzioni che li scompongono, così nessun componente
// ricava capitolo o libro con uno split fatto in casa.

import { CodiceLibro } from '../tipi/index.ts'
import type { ParolaId, VersettoId } from '../tipi/index.ts'

/** Nomi italiani dei cinque libri; l'ordine è quello canonico. */
export const LIBRI: { codice: CodiceLibro; nome: string; capitoli: number }[] = [
  { codice: 'gen', nome: 'Genesi', capitoli: 50 },
  { codice: 'exo', nome: 'Esodo', capitoli: 40 },
  { codice: 'lev', nome: 'Levitico', capitoli: 27 },
  { codice: 'num', nome: 'Numeri', capitoli: 36 },
  { codice: 'deu', nome: 'Deuteronomio', capitoli: 34 },
]

const NOMI = new Map(LIBRI.map((l) => [l.codice, l.nome]))
const CODICI = new Map(LIBRI.map((l) => [l.nome, l.codice]))

export type Posizione = { libro: CodiceLibro; capitolo: number }

export type RiferimentoVersetto = { libro: CodiceLibro; capitolo: number; versetto: number }

/** Scompone "gen.1.1"; null se l'id non è del Pentateuco (i rimandi TSK escono dal corpus). */
export function leggiVersettoId(id: string): RiferimentoVersetto | null {
  const [libro, capitolo, versetto] = id.split('.')
  const esito = CodiceLibro.safeParse(libro)
  if (!esito.success) return null
  const c = Number(capitolo)
  const v = Number(versetto)
  if (!Number.isInteger(c) || !Number.isInteger(v)) return null
  return { libro: esito.data, capitolo: c, versetto: v }
}

/** Il versetto a cui appartiene una parola: "gen.1.1.01" → "gen.1.1". */
export function versettoDiParola(id: ParolaId): VersettoId {
  return id.split('.').slice(0, 3).join('.')
}

const ORDINE_LIBRI = new Map(LIBRI.map((l, i) => [l.codice, i]))

/**
 * Chiave numerica per ordinare o confrontare id versetto (capitoli ≤ 50 e
 * versetti ≤ 176 stanno abbondantemente dentro i moltiplicatori scelti).
 * `null` fuori dal Pentateuco: i rimandi TSK non sono ordinabili qui.
 */
export function chiaveVersetto(id: string): number | null {
  const rif = leggiVersettoId(id)
  if (!rif) return null
  return (ORDINE_LIBRI.get(rif.libro) ?? 0) * 1_000_000 + rif.capitolo * 1_000 + rif.versetto
}

export function nomeLibro(codice: CodiceLibro): string {
  return NOMI.get(codice) ?? codice
}

/**
 * Etichetta leggibile di un id versetto: "gen.1.1" → "Genesi 1,1".
 * Fuori dal Pentateuco (rimandi TSK verso il resto della Bibbia) non abbiamo i
 * nomi italiani: si mostra l'id così com'è invece di inventare una traduzione.
 */
export function etichettaVersetto(id: string): string {
  const rif = leggiVersettoId(id)
  if (!rif) return id
  return `${nomeLibro(rif.libro)} ${rif.capitolo},${rif.versetto}`
}

/**
 * Inverso di `etichettaVersetto`: "Genesi 1,1" → "gen.1.1". `null` se il nome di
 * libro non è del Pentateuco o la forma non è "Nome C,V" — serve alla post-verifica
 * dei riferimenti citati dall'assistente (F4.3), che deve ricondurre l'etichetta a un
 * id per controllare se il versetto esiste ed era nel contesto recuperato.
 */
export function idDaEtichetta(etichetta: string): VersettoId | null {
  const m = etichetta.trim().match(/^(.+?)\s+(\d+)\s*,\s*(\d+)$/)
  if (!m) return null
  const codice = CODICI.get(m[1].trim())
  if (!codice) return null
  return `${codice}.${Number(m[2])}.${Number(m[3])}`
}
