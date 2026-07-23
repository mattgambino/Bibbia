// src/lib/genealogia.ts — dai dati curati ai tre alberi genealogici (F3.3).
//
// Tre scelte che reggono il file:
// 1. Il confine di un albero è **curato**, non inventato: le figure di una
//    genealogia sono quelle che le pericopi di quel capitolo nominano
//    (`events.persone`), non "tutti i discendenti di X" — che scapperebbe oltre
//    il capitolo. Così l'albero coincide con ciò su cui la curation si è espressa.
// 2. L'albero si costruisce sul solo legame `padre` (le genealogie di Gen 5, 10 e
//    11 sono patrilineari): un figlio ha un padre, e i suoi figli sono le figure
//    dell'insieme che indicano lui come padre. La madre resta un attributo della
//    scheda, non un ramo. Quando il padre di una figura non è nell'insieme, quella
//    figura è una radice: se le radici sono più d'una, l'albero si presenta in
//    tronchi separati — e quel numero è un dato, non un difetto da nascondere.
// 3. Le età sono quelle **letterali del testo** (`dati_narrativi`), mostrate come
//    dato narrativo: non si ricalcola qui l'Anno Mundi cumulativo, che è cronologia
//    curata e vive nella timeline con le sue avvertenze.

import { chiaveVersetto, leggiVersettoId, versettoDiParola } from './riferimenti.ts'
import type { Evento, Nota, Persona } from '../tipi/index.ts'

export type GenealogiaId = 'gen5' | 'gen10' | 'gen11'

/** Definizione editoriale di un albero: il capitolo che lo delimita. */
export type DefGenealogia = {
  id: GenealogiaId
  titolo: string
  sottotitolo: string
  capitolo: number
}

// I tre alberi richiesti dalla specifica §8 (Gen 5, 10, 11). Il confine è il
// capitolo: le figure sono quelle delle pericopi curate che vi ricadono.
export const GENEALOGIE: DefGenealogia[] = [
  { id: 'gen5', titolo: 'Da Adamo a Noè', sottotitolo: 'Genesi 5 · toledot di Adamo', capitolo: 5 },
  { id: 'gen10', titolo: 'La tavola delle nazioni', sottotitolo: 'Genesi 10 · i popoli nati da Noè', capitolo: 10 },
  { id: 'gen11', titolo: 'Da Sem ad Abramo', sottotitolo: 'Genesi 11 · toledot di Sem e di Terach', capitolo: 11 },
]

/** Nodo dell'albero: una figura e i suoi figli dentro l'insieme curato. */
export type NodoPersona = {
  persona: Persona
  figli: NodoPersona[]
}

export type Albero = {
  def: DefGenealogia
  /** Radici: le figure senza padre nell'insieme. Più d'una = tronchi separati. */
  radici: NodoPersona[]
  /** Quante figure in tutto (per l'apparato). */
  totale: number
}

/** Nome leggibile di una figura: italiano curato, poi traslitterazione, poi id. */
export function nomePersona(p: Persona): string {
  return p.nomi.it || p.nomi.translit || p.id
}

/** Il capitolo in cui una pericope cade, o null se non è del Pentateuco. */
function capitoloDiPericope(evento: Evento): number | null {
  const rif = leggiVersettoId(evento.range.da)
  return rif ? rif.capitolo : null
}

/**
 * Le figure di una genealogia: unione delle `persone` delle pericopi curate che
 * cadono nel suo capitolo, ristretta a chi esiste davvero in people.json. È il
 * confine curato dell'albero: fuori di lì non si aggiunge nessuno.
 */
function figureDi(def: DefGenealogia, eventi: readonly Evento[], persone: readonly Persona[]): Persona[] {
  const perId = new Map(persone.map((p) => [p.id, p]))
  const ids = new Set<string>()
  for (const e of eventi) {
    const rif = leggiVersettoId(e.range.da)
    if (rif?.libro === 'gen' && capitoloDiPericope(e) === def.capitolo) {
      for (const id of e.persone) if (perId.has(id)) ids.add(id)
    }
  }
  return [...ids].map((id) => perId.get(id)!)
}

/** Chiave d'ordine di una figura: il suo primo riferimento nel testo. */
function ordineFigura(p: Persona): number {
  const chiavi = p.riferimenti.map((r) => chiaveVersetto(r)).filter((k): k is number => k !== null)
  return chiavi.length > 0 ? Math.min(...chiavi) : Number.MAX_SAFE_INTEGER
}

/**
 * Costruisce l'albero di una genealogia. Padre come unico legame di discendenza;
 * i figli di un nodo sono le figure dell'insieme che lo indicano come padre,
 * ordinate come compaiono nel testo. Le radici sono le figure il cui padre non è
 * nell'insieme.
 */
export function costruisciAlbero(
  def: DefGenealogia,
  eventi: readonly Evento[],
  persone: readonly Persona[],
): Albero {
  const figure = figureDi(def, eventi, persone)
  const nelSet = new Set(figure.map((p) => p.id))

  const figliDi = new Map<string, Persona[]>()
  const radici: Persona[] = []
  for (const p of figure) {
    if (p.relazioni.padre && nelSet.has(p.relazioni.padre)) {
      const elenco = figliDi.get(p.relazioni.padre)
      if (elenco) elenco.push(p)
      else figliDi.set(p.relazioni.padre, [p])
    } else {
      radici.push(p)
    }
  }

  const visti = new Set<string>()
  const nodo = (p: Persona): NodoPersona => {
    visti.add(p.id)
    const figli = (figliDi.get(p.id) ?? [])
      .filter((f) => !visti.has(f.id)) // guardia contro cicli nei dati
      .sort((a, b) => ordineFigura(a) - ordineFigura(b))
      .map(nodo)
    return { persona: p, figli }
  }

  const alberi = radici.sort((a, b) => ordineFigura(a) - ordineFigura(b)).map(nodo)
  return { def, radici: alberi, totale: figure.length }
}

/* ------------------------------------------------------------------ note --- */

/** Il versetto a cui una nota si àncora, se il target è versetto o parola. */
function versettoDiNota(n: Nota): string | null {
  if (n.target.tipo === 'versetto') return n.target.ref
  if (n.target.tipo === 'parola') return versettoDiParola(n.target.ref)
  return null
}

/**
 * Le note critiche di una figura: quelle ancorate a un versetto **del capitolo
 * dell'albero** che compare fra i riferimenti della persona. Lo scope al capitolo
 * tiene fuori le note di altri passi in cui la stessa figura ricorre (Noè è
 * nominato da Gen 5 a Gen 10: nell'albero di Gen 5 porta solo le note di Gen 5).
 */
export function notePersona(note: readonly Nota[], persona: Persona, capitolo: number): Nota[] {
  const refs = new Set(persona.riferimenti)
  return note.filter((n) => {
    const v = versettoDiNota(n)
    if (!v || !refs.has(v)) return false
    const rif = leggiVersettoId(v)
    return rif?.libro === 'gen' && rif.capitolo === capitolo
  })
}

/**
 * Le note dell'albero nel suo insieme: quelle con target `pericope` il cui range
 * cade nel capitolo. Parlano della genealogia come unità (le tre tradizioni
 * testuali, il modo di calcolare l'Anno Mundi, Nimrod), non di una singola figura.
 */
export function noteGenealogia(note: readonly Nota[], capitolo: number): Nota[] {
  return note.filter((n) => {
    if (n.target.tipo !== 'pericope') return false
    const da = leggiVersettoId(n.target.ref.da)
    const a = leggiVersettoId(n.target.ref.a)
    return da?.libro === 'gen' && da.capitolo === capitolo && a?.capitolo === capitolo
  })
}

/** Indicizza le note per figura, una volta sola: id persona → note del capitolo. */
export function notePerFigura(note: readonly Nota[], albero: Albero): Map<string, Nota[]> {
  const mappa = new Map<string, Nota[]>()
  const percorri = (n: NodoPersona) => {
    const proprie = notePersona(note, n.persona, albero.def.capitolo)
    if (proprie.length > 0) mappa.set(n.persona.id, proprie)
    n.figli.forEach(percorri)
  }
  albero.radici.forEach(percorri)
  return mappa
}

/** Tutti gli id che compaiono in almeno un albero: per decidere dove offrire l'ingresso alle genealogie. */
export function idConAlbero(eventi: readonly Evento[], persone: readonly Persona[]): Set<string> {
  const insieme = new Set<string>()
  for (const def of GENEALOGIE) for (const p of figureDi(def, eventi, persone)) insieme.add(p.id)
  return insieme
}

/** In quale albero compare una figura (il primo per ordine di capitolo), o null. */
export function genealogiaDiPersona(
  personaId: string,
  eventi: readonly Evento[],
  persone: readonly Persona[],
): GenealogiaId | null {
  for (const def of GENEALOGIE) {
    if (figureDi(def, eventi, persone).some((p) => p.id === personaId)) return def.id
  }
  return null
}

/** Etichetta compatta dell'età letterale per il nodo: "visse 962 anni". */
export function etichettaEta(p: Persona): string | null {
  const d = p.dati_narrativi
  if (!d || d.eta_totale == null) return null
  return `visse ${d.eta_totale} anni`
}
