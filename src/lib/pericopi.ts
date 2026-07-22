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

/**
 * Un anno in forma leggibile: negativi = a.C., positivi = d.C.
 * Nei dati l'anno resta un intero con segno (SCHEMI-DATI §1): la notazione è
 * solo resa di superficie, e cambiarla non tocca nessun file.
 */
export function etichettaAnno(n: number): string {
  return n < 0 ? `${Math.abs(n)} a.C.` : `${n} d.C.`
}

/** Anni in forma leggibile: negativi = a.C., positivi = d.C. */
export function etichettaAnni(range: { da: number; a: number } | null): string | null {
  return etichettaIntervallo(range, etichettaAnno)
}

/**
 * L'asse narrato conta in Anno Mundi, che non è l'era cristiana: un 1656 di
 * Gen 5 va letto "1656 AM", mai "1656 d.C.". Sono due conteggi diversi e
 * l'unico modo di non fonderli è non usare per entrambi la stessa etichetta.
 */
export function etichettaAnnoMundi(n: number): string {
  return `${n} AM`
}

export function etichettaAnniMundi(range: { da: number; a: number } | null): string | null {
  return etichettaIntervallo(range, etichettaAnnoMundi)
}

function etichettaIntervallo(
  range: { da: number; a: number } | null,
  etichetta: (n: number) => string,
): string | null {
  if (!range) return null
  return range.da === range.a ? etichetta(range.da) : `${etichetta(range.da)} – ${etichetta(range.a)}`
}
