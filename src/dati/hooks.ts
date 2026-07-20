// src/dati/hooks.ts — hook React sopra i loader di caricamento.ts (task F0.4).

import { useEffect, useState } from 'react'
import type { CodiceLibro, LibroParole, LibroVersetti } from '../tipi/index.ts'
import { caricaParole, caricaVersetti } from './caricamento.ts'

/** Stato di un caricamento asincrono, discriminato su `stato`. */
export type Caricamento<T> =
  | { stato: 'in_corso' }
  | { stato: 'pronto'; dati: T }
  | { stato: 'errore'; messaggio: string }

// L'effetto dipende solo da `chiave`: la funzione `carica` cambia identità a ogni
// render ma è intenzionalmente fuori dalle dipendenze (il fetch vero è comunque
// dedupato dalla cache di caricamento.ts).
function useRisorsa<T>(chiave: string, carica: () => Promise<T>): Caricamento<T> {
  const [esito, setEsito] = useState<Caricamento<T>>({ stato: 'in_corso' })
  useEffect(() => {
    let attivo = true
    setEsito({ stato: 'in_corso' })
    carica().then(
      (dati) => {
        if (attivo) setEsito({ stato: 'pronto', dati })
      },
      (e: unknown) => {
        if (attivo) setEsito({ stato: 'errore', messaggio: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      attivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave])
  return esito
}

export function useVersetti(libro: CodiceLibro): Caricamento<LibroVersetti> {
  return useRisorsa(`verses/${libro}`, () => caricaVersetti(libro))
}

export function useParole(libro: CodiceLibro): Caricamento<LibroParole> {
  return useRisorsa(`words/${libro}`, () => caricaParole(libro))
}
