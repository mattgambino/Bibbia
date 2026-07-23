// src/lib/rag.ts — retrieval client-side per l'assistente (ROADMAP F4.2, specifica §9).
//
// Il retrieval è "rigido": l'assistente conosce solo ciò che è stato curato. I
// vettori di embeddings.json sono già normalizzati L2 (vedi gen-embeddings.ts),
// quindi la cosine similarity è un semplice prodotto scalare, una volta normalizzato
// anche il vettore della domanda. Si prendono i top-k tra versetti (traduzione
// letterale) e note curate, e con questi si costruisce il contesto passato al modello.
//
// I riferimenti citabili sono decisi qui e imposti dal system prompt: versetti come
// [Genesi 1,1] (la stessa etichetta usata ovunque nell'app, così i rimandi si
// riconoscono e si possono verificare), note come [nota:id]. Non si usa la forma
// inglese [Gen 6:4] degli esempi della specifica: quelle sono illustrazioni del
// meccanismo, non un vincolo di formato, e una sola convenzione in tutta l'app è più
// verificabile.
//
// Guardrail (F4.3, specifica §9). Il modello non è una fonte: la risposta viene
// ri-analizzata a valle (`analizzaRisposta`), ogni riferimento [..] è ricondotto al
// dataset e classificato — versetto/nota realmente recuperato, oppure esistente ma
// fuori dal contesto, oppure inesistente. Il testo dei versetti citati non è mai
// quello del modello: si inserisce qui dal database (`versettoTesto`). I riferimenti
// non verificati sono segnalati, non nascosti.

import type { Embeddings, VoceEmbedding } from '../tipi/index.ts'
import { etichettaVersetto, idDaEtichetta } from './riferimenti.ts'

export const TOP_K = 8

/** Prompt di sistema del §9: risponde solo dal contesto, cita, dichiara i vuoti,
 *  non riproduce mai il testo dei versetti (lo inserisce l'app dal database). */
export const SYSTEM_PROMPT = [
  'Sei un assistente di studio del Pentateuco. Rispondi in italiano.',
  '',
  'Regole tassative:',
  '1. Usa ESCLUSIVAMENTE le informazioni del CONTESTO fornito nel messaggio. Non aggiungere nulla di tuo, non ricorrere a conoscenze esterne.',
  '2. Fai seguire OGNI affermazione dal riferimento della fonte tra parentesi quadre: i versetti come [Genesi 1,1], le note come [nota:id-della-nota]. Usa solo i riferimenti che compaiono nel CONTESTO.',
  '3. Se il contesto non basta a rispondere, dichiaralo con queste parole: "Non ho materiale curato su questo aspetto." Non colmare i vuoti con supposizioni.',
  '4. NON riprodurre né citare tra virgolette il testo dei versetti: l\'applicazione lo inserisce dal database quando lo citi con il riferimento. Parafrasa e rimanda al riferimento.',
  '5. Distingui le prospettive quando la fonte lo fa (storico-critica vs tradizione ebraica); non fonderle e non gerarchizzarle.',
].join('\n')

export type VoceRecuperata = { voce: VoceEmbedding; punteggio: number }

/** Normalizza L2 un vettore (quello della domanda: i documenti lo sono già). */
export function normalizza(v: number[]): number[] {
  let somma = 0
  for (const x of v) somma += x * x
  const norma = Math.sqrt(somma)
  if (norma === 0) return v.slice()
  return v.map((x) => x / norma)
}

function prodotto(a: number[], b: number[]): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/** Top-k voci per similarità col vettore della domanda (già normalizzato). */
export function recupera(embeddings: Embeddings, domandaVec: number[], k = TOP_K): VoceRecuperata[] {
  const q = normalizza(domandaVec)
  return embeddings.voci
    .map((voce) => ({ voce, punteggio: prodotto(q, voce.v) }))
    .sort((a, b) => b.punteggio - a.punteggio)
    .slice(0, k)
}

/** L'etichetta citabile di una voce: [Genesi 1,1] per i versetti, nota:id per le note. */
export function etichettaVoce(voce: VoceEmbedding): string {
  return voce.tipo === 'versetto' ? etichettaVersetto(voce.ref) : `nota:${voce.ref}`
}

/** Come la voce compare nel corpo dell'app: serve alle fonti mostrate a lato. */
export type Fonte = { tipo: 'versetto' | 'nota'; ref: string; etichetta: string; titolo?: string }

/**
 * Costruisce il blocco di contesto e l'elenco delle fonti. `testoVersetto` e `nota`
 * risolvono i testi dal database (traduzione letterale e note curate): se una voce
 * recuperata non ha testo disponibile, viene saltata — meglio meno contesto che
 * contesto vuoto etichettato con un riferimento.
 */
export function costruisciContesto(
  recuperate: VoceRecuperata[],
  fonti: {
    testoVersetto: (ref: string) => string | undefined
    nota: (id: string) => { titolo: string; testo: string } | undefined
  },
): { blocco: string; fonti: Fonte[] } {
  const parti: string[] = []
  const usate: Fonte[] = []

  for (const { voce } of recuperate) {
    const etichetta = etichettaVoce(voce)
    if (voce.tipo === 'versetto') {
      const testo = fonti.testoVersetto(voce.ref)
      if (!testo) continue
      parti.push(`[${etichetta}]\n${testo}`)
      usate.push({ tipo: 'versetto', ref: voce.ref, etichetta })
    } else {
      const n = fonti.nota(voce.ref)
      if (!n) continue
      parti.push(`[${etichetta}] ${n.titolo}\n${n.testo}`)
      usate.push({ tipo: 'nota', ref: voce.ref, etichetta, titolo: n.titolo })
    }
  }

  return { blocco: parti.join('\n\n'), fonti: usate }
}

/** I messaggi per /api/chat: il prompt di sistema del §9 e il contesto + la domanda. */
export function messaggiChat(
  blocco: string,
  domanda: string,
): { role: 'system' | 'user'; content: string }[] {
  const utente = [
    'CONTESTO',
    '========',
    blocco,
    '',
    'DOMANDA',
    '=======',
    domanda,
  ].join('\n')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: utente },
  ]
}

/* ------------------------------------------------- post-verifica (F4.3) --------- */

/**
 * Esito di un riferimento citato nella risposta:
 * - `versetto` / `nota`: esiste nel dataset **e** era nel contesto recuperato → ok;
 * - `fuori-contesto`: esiste nel dataset ma non era tra i passi recuperati (il
 *   modello lo ha portato da fuori) → da segnalare;
 * - `inesistente`: non risolvibile nel dataset (riferimento inventato) → da segnalare.
 */
export type EsitoRif = 'versetto' | 'nota' | 'fuori-contesto' | 'inesistente'

/** Un pezzo di risposta: testo semplice oppure un riferimento già verificato. */
export type Segmento =
  | { tipo: 'testo'; testo: string }
  | SegmentoRif

export type SegmentoRif = {
  tipo: 'rif'
  esito: EsitoRif
  refTipo: 'versetto' | 'nota'
  /** id risolto (gen.1.1 o id della nota); presente anche sui riferimenti inesistenti. */
  ref: string
  /** etichetta leggibile ("Genesi 1,1" o "nota:id"). */
  etichetta: string
  /** testo del versetto **dal database** (mai dal modello); solo su `versetto`. */
  versettoTesto?: string
  /** true solo alla prima occorrenza di un versetto, per non ripeterne il testo. */
  primaOccorrenza?: boolean
  /** titolo/testo della nota dal database; presenti su `nota`. */
  notaTitolo?: string
  notaTesto?: string
}

/** Riferimento nel corpo della risposta: parentesi quadre non annidate, su una riga. */
const RE_RIFERIMENTO = /\[([^\]\n]+)\]/g

type ContestoVerifica = {
  fonti: Fonte[]
  testoVersetto: (ref: string) => string | undefined
  nota: (id: string) => { titolo: string; testo: string } | undefined
}

/**
 * Scompone la risposta del modello in testo e riferimenti verificati. Ogni `[...]`
 * viene ricondotto al dataset: un versetto porta con sé il proprio testo dal
 * database, una nota il proprio titolo/testo; ciò che non risolve o non era nel
 * contesto è marcato e conteggiato in `anomalie`. Il testo che non è un riferimento
 * riconoscibile resta tale, parentesi comprese.
 */
export function analizzaRisposta(
  testo: string,
  ctx: ContestoVerifica,
): { segmenti: Segmento[]; anomalie: SegmentoRif[] } {
  const versiInContesto = new Set(ctx.fonti.filter((f) => f.tipo === 'versetto').map((f) => f.ref))
  const noteInContesto = new Set(ctx.fonti.filter((f) => f.tipo === 'nota').map((f) => f.ref))
  const versiMostrati = new Set<string>()

  const segmenti: Segmento[] = []
  const anomalie: SegmentoRif[] = []
  let cursore = 0

  for (const m of testo.matchAll(RE_RIFERIMENTO)) {
    const inizio = m.index ?? 0
    if (inizio > cursore) segmenti.push({ tipo: 'testo', testo: testo.slice(cursore, inizio) })
    cursore = inizio + m[0].length

    const seg = classifica(m[1].trim(), ctx, versiInContesto, noteInContesto, versiMostrati)
    if (!seg) {
      // Non è un riferimento riconoscibile: lo si lascia com'era, parentesi comprese.
      segmenti.push({ tipo: 'testo', testo: m[0] })
      continue
    }
    if (seg.esito === 'fuori-contesto' || seg.esito === 'inesistente') anomalie.push(seg)
    segmenti.push(seg)
  }
  if (cursore < testo.length) segmenti.push({ tipo: 'testo', testo: testo.slice(cursore) })

  return { segmenti, anomalie }
}

function classifica(
  grezzo: string,
  ctx: ContestoVerifica,
  versiInContesto: Set<string>,
  noteInContesto: Set<string>,
  versiMostrati: Set<string>,
): SegmentoRif | null {
  const nota = grezzo.match(/^nota:\s*(.+)$/i)
  if (nota) {
    const id = nota[1].trim()
    const etichetta = `nota:${id}`
    const n = ctx.nota(id)
    if (!n) return { tipo: 'rif', esito: 'inesistente', refTipo: 'nota', ref: id, etichetta }
    if (!noteInContesto.has(id))
      return { tipo: 'rif', esito: 'fuori-contesto', refTipo: 'nota', ref: id, etichetta, notaTitolo: n.titolo }
    return { tipo: 'rif', esito: 'nota', refTipo: 'nota', ref: id, etichetta, notaTitolo: n.titolo, notaTesto: n.testo }
  }

  const id = idDaEtichetta(grezzo)
  if (!id) return null // né nota né etichetta di versetto: non è un riferimento

  const etichetta = etichettaVersetto(id)
  const testo = ctx.testoVersetto(id)
  // "Esiste nel dataset" = l'app ne ha il testo curato. Un versetto fuori dal corpus
  // (fuori da Gen 1–3, dove arriva la letterale) non è inseribile dal database:
  // se non era nemmeno nel contesto lo si tratta come inventato.
  if (testo === undefined) {
    const esito: EsitoRif = versiInContesto.has(id) ? 'fuori-contesto' : 'inesistente'
    return { tipo: 'rif', esito, refTipo: 'versetto', ref: id, etichetta }
  }
  if (!versiInContesto.has(id))
    return { tipo: 'rif', esito: 'fuori-contesto', refTipo: 'versetto', ref: id, etichetta }

  const primaOccorrenza = !versiMostrati.has(id)
  versiMostrati.add(id)
  return { tipo: 'rif', esito: 'versetto', refTipo: 'versetto', ref: id, etichetta, versettoTesto: testo, primaOccorrenza }
}
