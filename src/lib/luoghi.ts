// src/lib/luoghi.ts — dai luoghi di places.json a quelli del range curato (F3.1).
//
// `places.json` è generato da TIPNR e copre tutto il Pentateuco: la mappa non
// mostra quei 244 record ma i luoghi che una pericope curata nomina davvero.
// È la stessa unità della colonna contesto (F2.2): la curation attacca i luoghi
// alle pericopi, quindi sono le pericopi a dire quali luoghi esistono per l'app
// e in quali capitoli si incontrano.

import { chiaveVersetto, leggiVersettoId, nomeLibro } from './riferimenti.ts'
import type { Evento, Luogo } from '../tipi/index.ts'

/** Capitolo in forma di id: "gen.2". Serve come chiave di filtro, non come riferimento. */
export type CapitoloId = string

export type LuogoCurato = {
  luogo: Luogo
  /** Capitoli in cui una pericope curata nomina il luogo, in ordine canonico. */
  capitoli: CapitoloId[]
  /** Le pericopi che lo nominano, nell'ordine in cui compaiono in events.json. */
  pericopi: Evento[]
}

/** I capitoli toccati da un range di pericope; attraverso i libri si prendono i due estremi. */
function capitoliDelRange(range: { da: string; a: string }): CapitoloId[] {
  const da = leggiVersettoId(range.da)
  const a = leggiVersettoId(range.a)
  if (!da) return []
  if (!a) return [`${da.libro}.${da.capitolo}`]
  if (a.libro !== da.libro) return [`${da.libro}.${da.capitolo}`, `${a.libro}.${a.capitolo}`]
  const capitoli: CapitoloId[] = []
  for (let c = da.capitolo; c <= a.capitolo; c++) capitoli.push(`${da.libro}.${c}`)
  return capitoli
}

/** Ordine canonico dei capitoli: libro, poi numero. Il versetto 0 è solo un appoggio. */
function ordineCapitolo(c: CapitoloId): number {
  return chiaveVersetto(`${c}.0`) ?? Number.MAX_SAFE_INTEGER
}

export function etichettaCapitolo(c: CapitoloId): string {
  const rif = leggiVersettoId(`${c}.1`)
  return rif ? `${nomeLibro(rif.libro)} ${rif.capitolo}` : c
}

export function nomeLuogo(luogo: Luogo): string {
  return luogo.nomi.it || luogo.nomi.translit || luogo.id
}

/**
 * Un luogo va sulla carta solo se ha coordinate **e** non è `symbolic`: la
 * curation che giudica simbolico un riferimento ha già escluso che sia un punto
 * sulla terra, e un marker lo rimetterebbe in gioco (regola fissata in F2.2).
 * Le ipotesi dei repertori restano leggibili nella scheda, con il loro peso.
 */
export function collocabile(luogo: Luogo): boolean {
  return luogo.status !== 'symbolic' && luogo.candidati.length > 0
}

/**
 * Gli id dei luoghi nominati da almeno una pericope, cioè il **perimetro della
 * curation**: chi sta dentro è stato guardato da qualcuno, chi sta fuori no.
 *
 * È un fatto strutturale già scritto nei dati (`evento.luoghi`), non una
 * convenzione di compilazione: per questo lo si deriva qui invece di leggere
 * `nomi.it`, che oggi dà lo stesso insieme ma per abitudine, e smetterebbe di
 * darlo al primo luogo curato a mano senza nome italiano. Nessun campo nuovo di
 * schema: il divieto di F5.3 vale anche per un campo comodo.
 */
export function idsNelPerimetroDiCuration(eventi: readonly Evento[]): Set<string> {
  return new Set(eventi.flatMap((e) => e.luoghi))
}

/**
 * I luoghi nominati dalle pericopi curate, ordinati per prima comparsa nel testo
 * e, a parità, per nome. `mancanti` sono gli id citati da una pericope ma assenti
 * da places.json: un buco nei dati che va detto, non nascosto.
 */
export function luoghiCurati(
  eventi: readonly Evento[],
  luoghi: readonly Luogo[],
): { curati: LuogoCurato[]; mancanti: string[] } {
  const perId = new Map(luoghi.map((l) => [l.id, l]))
  const raccolti = new Map<string, { capitoli: Set<CapitoloId>; pericopi: Evento[] }>()
  const mancanti = new Set<string>()

  for (const evento of eventi) {
    for (const id of evento.luoghi) {
      if (!perId.has(id)) {
        mancanti.add(id)
        continue
      }
      const voce = raccolti.get(id) ?? { capitoli: new Set<CapitoloId>(), pericopi: [] }
      for (const c of capitoliDelRange(evento.range)) voce.capitoli.add(c)
      voce.pericopi.push(evento)
      raccolti.set(id, voce)
    }
  }

  const curati: LuogoCurato[] = [...raccolti].map(([id, voce]) => ({
    luogo: perId.get(id)!,
    capitoli: [...voce.capitoli].sort((x, y) => ordineCapitolo(x) - ordineCapitolo(y)),
    pericopi: voce.pericopi,
  }))
  curati.sort((x, y) => {
    const dc = ordineCapitolo(x.capitoli[0] ?? '') - ordineCapitolo(y.capitoli[0] ?? '')
    return dc !== 0 ? dc : nomeLuogo(x.luogo).localeCompare(nomeLuogo(y.luogo), 'it')
  })
  return { curati, mancanti: [...mancanti] }
}

/** Tutti i capitoli rappresentati, in ordine canonico: sono le voci del filtro. */
export function capitoliDi(curati: readonly LuogoCurato[]): CapitoloId[] {
  const insieme = new Set<CapitoloId>()
  for (const c of curati) for (const capitolo of c.capitoli) insieme.add(capitolo)
  return [...insieme].sort((x, y) => ordineCapitolo(x) - ordineCapitolo(y))
}
