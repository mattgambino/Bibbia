// src/lib/ricerca.ts — logica pura della ricerca (ROADMAP F5.1).
//
// Tre corpora indipendenti, un solo criterio di confronto. La ricerca gira tutta
// in memoria sui dati già caricati: testo delle traduzioni installate, lemmi
// (indices/lemmi.json + glosse italiane di lexicon_it.json), entità (luoghi e
// persone). Nessuna chiamata di rete a runtime (CLAUDE.md regola 5).
//
// La costruzione degli indici (normalizzazione dei campi ricercabili) si fa una
// volta sola quando i dati arrivano; il filtro per query scorre indici già
// normalizzati, così ogni battuta non ripaga la normalizzazione dell'intero
// corpus. Le funzioni `costruisci*` producono l'indice; le funzioni `cerca*` lo
// filtrano.

import { idsNelPerimetroDiCuration } from './luoghi.ts'
import { chiaveVersetto, etichettaVersetto } from './riferimenti.ts'
import type {
  Confidenza,
  Evento,
  IndiceLemmi,
  LexiconIt,
  Luogo,
  ParolaId,
  Persona,
  Traduzione,
  VersettoId,
} from '../tipi/index.ts'

/** Lunghezza minima della query: sotto i 2 caratteri la ricerca non parte. */
export const MIN_QUERY = 2

// Segni combinanti da togliere nel confronto: due intervalli distinti — i
// diacritici latini (U+0300–U+036F) e i punti dell'ebraico, niqqud e te'amim
// (U+0591–U+05C7). Vanno tenuti separati: un unico intervallo 0300–05C7
// inghiottirebbe anche le consonanti ebraiche (U+05D0–U+05EA), cancellandole.
const SEGNI_COMBINANTI = /[\u0300-\u036f\u0591-\u05c7]/g
const SEGNO_COMBINANTE = /[\u0300-\u036f\u0591-\u05c7]/

/**
 * Forma di confronto: minuscolo, poi si tolgono i segni combinanti — i diacritici
 * latini della traslitterazione (ā ē î ḏ ṯ š ḥ…) e i punti dell'ebraico (niqqud e
 * te'amim). Così «issa» trova «ʾiššâ», «eufrate» trova «Eufrate», e una query
 * ebraica in sole consonanti trova il testo vocalizzato. I modificatori ʾ ʿ
 * (U+02BE/BF) non sono combinanti e restano: la sottostringa li scavalca lo stesso.
 */
export function normalizza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(SEGNI_COMBINANTI, '')
}

// Separatori e modificatori che spezzano la traslitterazione ma non ne cambiano
// il suono: il punto di sillabazione TIPNR (No.ach, Ma.yim), il punto mediano, e
// i modificatori ʾ ʿ (aleph/ayin). Toglierli fa sì che «mayim» trovi «Ma.yim» e
// «eden» trovi «ʿēḏen». Non si applica al testo delle traduzioni, dove il punto è
// fine frase.
const SEPARATORI_TRANSLIT = /[.·‧’'ʾʿ]/g

/** Confronto più permissivo per nomi e traslitterazioni (lemmi, entità). */
export function normalizzaEstesa(s: string): string {
  return normalizza(s).replace(SEPARATORI_TRANSLIT, '')
}

/**
 * Come `normalizza`, ma tiene la mappa da ogni carattere normalizzato alla sua
 * posizione nell'originale: serve a ritagliare lo snippet sul testo vero dopo
 * aver trovato la corrispondenza sulla forma normalizzata (che, tolti i segni,
 * ha lunghezza diversa).
 */
function normalizzaConMappa(s: string): { norm: string; mappa: number[] } {
  let norm = ''
  const mappa: number[] = []
  for (let i = 0; i < s.length; i++) {
    const decomposto = s[i].toLowerCase().normalize('NFD')
    for (const c of decomposto) {
      if (SEGNO_COMBINANTE.test(c)) continue
      norm += c
      mappa.push(i)
    }
  }
  return { norm, mappa }
}

/** La query trovata al centro, col contesto ai lati e le tre parti separate
 *  perché il componente evidenzi solo `hit`. */
export type Snippet = {
  pre: string
  hit: string
  post: string
  troncatoInizio: boolean
  troncatoFine: boolean
}

const CONTESTO_SNIPPET = 42

function estraiSnippet(originale: string, mappa: number[], indiceNorm: number, lunghezzaNorm: number): Snippet {
  const inizio = mappa[indiceNorm]
  const fine = indiceNorm + lunghezzaNorm < mappa.length ? mappa[indiceNorm + lunghezzaNorm] : originale.length
  let a = Math.max(0, inizio - CONTESTO_SNIPPET)
  let b = Math.min(originale.length, fine + CONTESTO_SNIPPET)
  // Non si taglia a metà di una parola quando il bordo non è già l'estremo del versetto.
  if (a > 0) {
    const spazio = originale.indexOf(' ', a)
    if (spazio !== -1 && spazio < inizio) a = spazio + 1
  }
  if (b < originale.length) {
    const spazio = originale.lastIndexOf(' ', b)
    if (spazio !== -1 && spazio > fine) b = spazio
  }
  return {
    pre: originale.slice(a, inizio),
    hit: originale.slice(inizio, fine),
    post: originale.slice(fine, b),
    troncatoInizio: a > 0,
    troncatoFine: b < originale.length,
  }
}

function ordineVersetto(id: VersettoId): number {
  return chiaveVersetto(id) ?? Number.MAX_SAFE_INTEGER
}

/* ------------------------------------------------------------------ testo --- */

/** Una traduzione ridotta a ciò che serve alla ricerca. */
export type FonteTesto = { id: string; nome: string; testi: Record<string, string> }

type VoceTesto = {
  versetto: VersettoId
  etichetta: string
  traduzioneId: string
  traduzioneNome: string
  originale: string
  norm: string
  mappa: number[]
}

export type RisultatoTesto = {
  chiave: string
  versetto: VersettoId
  etichetta: string
  traduzioneId: string
  traduzioneNome: string
  snippet: Snippet
}

export function fonteTesto(traduzione: Traduzione): FonteTesto {
  return { id: traduzione.meta.id, nome: traduzione.meta.nome, testi: traduzione.testi }
}

export function costruisciCorpusTesto(traduzioni: FonteTesto[]): VoceTesto[] {
  const voci: VoceTesto[] = []
  for (const t of traduzioni) {
    for (const [versetto, testo] of Object.entries(t.testi)) {
      const { norm, mappa } = normalizzaConMappa(testo)
      voci.push({
        versetto: versetto as VersettoId,
        etichetta: etichettaVersetto(versetto),
        traduzioneId: t.id,
        traduzioneNome: t.nome,
        originale: testo,
        norm,
        mappa,
      })
    }
  }
  return voci
}

export type Esito<T> = { risultati: T[]; totale: number }

export function cercaTesto(corpus: VoceTesto[], query: string, limite: number): Esito<RisultatoTesto> {
  const q = normalizza(query)
  if (q.length < MIN_QUERY) return { risultati: [], totale: 0 }
  const grezzi: { v: VoceTesto; idx: number }[] = []
  for (const v of corpus) {
    const idx = v.norm.indexOf(q)
    if (idx !== -1) grezzi.push({ v, idx })
  }
  grezzi.sort(
    (a, b) =>
      ordineVersetto(a.v.versetto) - ordineVersetto(b.v.versetto) ||
      a.v.traduzioneId.localeCompare(b.v.traduzioneId),
  )
  // Lo snippet si costruisce solo per ciò che si mostra: sull'intero insieme dei
  // match sarebbe lavoro sprecato appena la query è generica.
  const risultati = grezzi.slice(0, limite).map(({ v, idx }) => ({
    chiave: `${v.versetto}|${v.traduzioneId}`,
    versetto: v.versetto,
    etichetta: v.etichetta,
    traduzioneId: v.traduzioneId,
    traduzioneNome: v.traduzioneNome,
    snippet: estraiSnippet(v.originale, v.mappa, idx, q.length),
  }))
  return { risultati, totale: grezzi.length }
}

/* ------------------------------------------------------------------ lemmi --- */

export type RisultatoLemma = {
  dStrong: string
  lemma: string
  translit: string
  glossa: string
  glossaLingua: 'it' | 'en'
  daVerificare: boolean
  occorrenze: number
  prima: ParolaId | null
}

type VoceLemmaRic = { risultato: RisultatoLemma; campi: string[] }

/**
 * L'italiano di lexicon_it.json, dove c'è, è la glossa mostrata (e cercabile); la
 * glossa inglese di TAHOT resta comunque nei campi di ricerca, così una query in
 * inglese trova anche i lemmi già glossati in italiano.
 */
export function costruisciIndiceLemmi(indice: IndiceLemmi, lexicon: LexiconIt): VoceLemmaRic[] {
  const voci: VoceLemmaRic[] = []
  for (const [dStrong, voce] of Object.entries(indice.lemmi)) {
    const it = lexicon[dStrong]
    voci.push({
      risultato: {
        dStrong,
        lemma: voce.lemma,
        translit: voce.translit,
        glossa: it ? it.glossa_it : voce.glossa_en,
        glossaLingua: it ? 'it' : 'en',
        daVerificare: it ? it.da_verificare : false,
        occorrenze: voce.occorrenze.length,
        prima: voce.occorrenze[0] ?? null,
      },
      campi: [
        normalizzaEstesa(voce.lemma),
        normalizzaEstesa(voce.translit),
        normalizzaEstesa(voce.glossa_en),
        it ? normalizzaEstesa(it.glossa_it) : '',
      ],
    })
  }
  return voci
}

export function cercaLemmi(voci: VoceLemmaRic[], query: string, limite: number): Esito<RisultatoLemma> {
  const q = normalizzaEstesa(query)
  if (q.length < MIN_QUERY) return { risultati: [], totale: 0 }
  const trovati = voci.filter((v) => v.campi.some((c) => c.includes(q))).map((v) => v.risultato)
  // Prima i lemmi più frequenti: su una glossa comune («terra», «dire») è quello
  // che il lettore cerca più spesso.
  trovati.sort((a, b) => b.occorrenze - a.occorrenze)
  return { risultati: trovati.slice(0, limite), totale: trovati.length }
}

/* ----------------------------------------------------------------- entità --- */

export type RisultatoEntita = {
  tipo: 'luogo' | 'persona'
  id: string
  nome: string
  translit: string
  he: string
  /** Lo status **da mostrare**: null quando non c'è un giudizio che qualcuno abbia dato. */
  status: Confidenza | null
  /** Luogo mai nominato da una pericope: fuori dal perimetro della curation. */
  fuoriPerimetro: boolean
  primoRiferimento: VersettoId | null
}

type VoceEntitaRic = { risultato: RisultatoEntita; campi: string[]; ordine: number }

function primoRiferimento(riferimenti: readonly VersettoId[]): VersettoId | null {
  if (riferimenti.length === 0) return null
  return [...riferimenti].sort((a, b) => ordineVersetto(a) - ordineVersetto(b))[0]
}

/**
 * Luoghi e persone insieme: si cercano per nome italiano, traslitterazione, forma
 * ebraica o id. A differenza della mappa (solo i luoghi del range curato), qui
 * l'insieme è tutto places.json/people.json — chi cerca «Nod» o «Enosh» vuole
 * trovarlo anche se la curation non l'ha ancora ripreso; il clic porta comunque a
 * un versetto del testo.
 *
 * Ed è proprio perché qui entrano anche i luoghi che la curation non ha ripreso
 * che lo `status` va filtrato: su quelli, `disputed` non è un giudizio ma il
 * default prudente dell'import TIPNR, e mostrarlo direbbe al lettore che la
 * questione è aperta fra ipotesi concorrenti — un'affermazione di merito che
 * nessuno ha fatto. Fuori dal perimetro lo status non si mostra affatto: si
 * dichiara che il luogo non è ancora entrato in curation, che è il dato vero.
 */
export function costruisciIndiceEntita(
  luoghi: readonly Luogo[],
  persone: readonly Persona[],
  eventi: readonly Evento[],
): VoceEntitaRic[] {
  const perimetro = idsNelPerimetroDiCuration(eventi)
  const voci: VoceEntitaRic[] = []
  for (const l of luoghi) {
    const rif = primoRiferimento(l.riferimenti)
    const fuoriPerimetro = !perimetro.has(l.id)
    voci.push({
      risultato: {
        tipo: 'luogo',
        id: l.id,
        nome: l.nomi.it || l.nomi.translit || l.id,
        translit: l.nomi.translit,
        he: l.nomi.he,
        status: fuoriPerimetro ? null : l.status,
        fuoriPerimetro,
        primoRiferimento: rif,
      },
      campi: [l.nomi.it, l.nomi.translit, l.nomi.he, l.id].map(normalizzaEstesa),
      ordine: rif ? ordineVersetto(rif) : Number.MAX_SAFE_INTEGER,
    })
  }
  for (const p of persone) {
    const rif = primoRiferimento(p.riferimenti)
    voci.push({
      risultato: {
        tipo: 'persona',
        id: p.id,
        nome: p.nomi.it || p.nomi.translit || p.id,
        translit: p.nomi.translit,
        he: p.nomi.he,
        // Le persone non portano status nello schema: niente da filtrare, e la
        // dicitura di perimetro non le riguarda.
        status: null,
        fuoriPerimetro: false,
        primoRiferimento: rif,
      },
      campi: [p.nomi.it, p.nomi.translit, p.nomi.he, p.id].map(normalizzaEstesa),
      ordine: rif ? ordineVersetto(rif) : Number.MAX_SAFE_INTEGER,
    })
  }
  return voci
}

export function cercaEntita(voci: VoceEntitaRic[], query: string, limite: number): Esito<RisultatoEntita> {
  const q = normalizzaEstesa(query)
  if (q.length < MIN_QUERY) return { risultati: [], totale: 0 }
  const trovati = voci.filter((v) => v.campi.some((c) => c.includes(q)))
  // Ordine di comparsa nel testo, poi nome: come si incontrerebbero leggendo.
  trovati.sort((a, b) => a.ordine - b.ordine || a.risultato.nome.localeCompare(b.risultato.nome, 'it'))
  return { risultati: trovati.slice(0, limite).map((v) => v.risultato), totale: trovati.length }
}
