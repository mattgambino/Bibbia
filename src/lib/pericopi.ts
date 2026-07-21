// src/lib/pericopi.ts — dalla posizione di lettura alla pericope curata (F2.2).
//
// La colonna contesto non è sincronizzata sul versetto ma sulla pericope che lo
// contiene: è l'unità a cui la curation attacca luoghi, tempi e personaggi.
// Le pericopi sono contigue solo dentro i range già curati (Gen 1-3 oggi), fuori
// la ricerca non trova nulla e la colonna lo dichiara.

import { chiaveVersetto, etichettaVersetto, leggiVersettoId } from './riferimenti.ts'
import type { Evento } from '../tipi/index.ts'

/** La pericope che contiene il versetto, o null se il passo non è ancora curato. */
export function pericopeDi(eventi: readonly Evento[], versetto: string): Evento | null {
  const k = chiaveVersetto(versetto)
  if (k === null) return null
  for (const evento of eventi) {
    const da = chiaveVersetto(evento.range.da)
    const a = chiaveVersetto(evento.range.a)
    if (da === null || a === null) continue
    if (k >= da && k <= a) return evento
  }
  return null
}

/**
 * Etichetta compatta di un range: "Genesi 1,1–2" dentro lo stesso capitolo,
 * "Genesi 1,1–2,3" attraverso i capitoli, forma estesa attraverso i libri.
 */
export function etichettaRange(da: string, a: string): string {
  const rda = leggiVersettoId(da)
  const ra = leggiVersettoId(a)
  if (!rda || !ra) return `${da}–${a}`
  if (da === a) return etichettaVersetto(da)
  if (rda.libro !== ra.libro) return `${etichettaVersetto(da)} – ${etichettaVersetto(a)}`
  if (rda.capitolo !== ra.capitolo) return `${etichettaVersetto(da)}–${ra.capitolo},${ra.versetto}`
  return `${etichettaVersetto(da)}–${ra.versetto}`
}

/** Un anno in forma leggibile: negativi = a.e.v., positivi = e.v. */
export function etichettaAnno(n: number): string {
  return n < 0 ? `${Math.abs(n)} a.e.v.` : `${n} e.v.`
}

/** Anni in forma leggibile: negativi = a.e.v., positivi = e.v. */
export function etichettaAnni(range: { da: number; a: number } | null): string | null {
  if (!range) return null
  return range.da === range.a ? etichettaAnno(range.da) : `${etichettaAnno(range.da)} – ${etichettaAnno(range.a)}`
}
