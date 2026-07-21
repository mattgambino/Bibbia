// src/stato/preferenze.ts — preferenze utente in localStorage (ROADMAP F1.6b).
//
// Persistiamo solo ciò che serve a riprendere la lettura: posizione e traduzione
// a fronte. Ogni valore letto è ri-validato: una chiave manomessa o rimasta da
// una versione precedente non deve poter rompere l'avvio, si torna al default.

import { useCallback, useState } from 'react'
import { CodiceLibro } from '../tipi/index.ts'
import { LIBRI } from '../lib/riferimenti.ts'
import type { Posizione } from '../lib/riferimenti.ts'

const CHIAVE_POSIZIONE = 'pentateuco.posizione'
const CHIAVE_TRADUZIONE = 'pentateuco.traduzione'

export const POSIZIONE_INIZIALE: Posizione = { libro: 'gen', capitolo: 1 }
export const TRADUZIONE_INIZIALE = 'luzzi'

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave)
  } catch {
    // localStorage può essere negato (modalità privata, policy del browser):
    // l'app resta usabile, semplicemente senza memoria fra le sessioni.
    return null
  }
}

function scrivi(chiave: string, valore: string): void {
  try {
    localStorage.setItem(chiave, valore)
  } catch {
    /* vedi leggi() */
  }
}

function posizioneSalvata(): Posizione {
  const grezzo = leggi(CHIAVE_POSIZIONE)
  if (!grezzo) return POSIZIONE_INIZIALE
  const [libro, capitolo] = grezzo.split('.')
  const esito = CodiceLibro.safeParse(libro)
  if (!esito.success) return POSIZIONE_INIZIALE
  const c = Number(capitolo)
  const max = LIBRI.find((l) => l.codice === esito.data)!.capitoli
  if (!Number.isInteger(c) || c < 1 || c > max) return POSIZIONE_INIZIALE
  return { libro: esito.data, capitolo: c }
}

/** Posizione di lettura corrente, persistita a ogni cambio. */
export function usaPosizione(): [Posizione, (p: Posizione) => void] {
  const [posizione, setPosizione] = useState<Posizione>(posizioneSalvata)
  const aggiorna = useCallback((p: Posizione) => {
    setPosizione(p)
    scrivi(CHIAVE_POSIZIONE, `${p.libro}.${p.capitolo}`)
  }, [])
  return [posizione, aggiorna]
}

/**
 * Id della traduzione a fronte. La validità dell'id non si può controllare qui
 * (dipende dal manifest, che è asincrono): ci pensa la vista, che ricade sulla
 * prima traduzione disponibile se quella salvata non c'è più.
 */
export function usaTraduzione(): [string, (id: string) => void] {
  const [id, setId] = useState<string>(() => {
    const salvato = leggi(CHIAVE_TRADUZIONE)
    if (salvato) return salvato
    // Si scrive subito anche il default, così la chiave esiste dalla prima
    // sessione e il valore effettivo è sempre ispezionabile.
    scrivi(CHIAVE_TRADUZIONE, TRADUZIONE_INIZIALE)
    return TRADUZIONE_INIZIALE
  })
  const aggiorna = useCallback((nuovo: string) => {
    setId(nuovo)
    scrivi(CHIAVE_TRADUZIONE, nuovo)
  }, [])
  return [id, aggiorna]
}
