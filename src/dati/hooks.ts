// src/dati/hooks.ts — hook React sopra i loader di caricamento.ts (task F0.4).

import { useEffect, useState } from 'react'
import type {
  CodiceLibro,
  Embeddings,
  IndiceLemmi,
  LexiconIt,
  LibroParole,
  LibroVersetti,
  ManifestTraduzioni,
  Traduzione,
} from '../tipi/index.ts'
import type { Eventi, Luoghi, Note, Persone } from './caricamento.ts'
import { LIBRI } from '../lib/riferimenti.ts'
import {
  caricaEmbeddings,
  caricaEventi,
  caricaIndiceLemmi,
  caricaLexiconIt,
  caricaLuoghi,
  caricaNote,
  caricaPersone,
  caricaManifestTraduzioni,
  caricaParole,
  caricaTraduzione,
  caricaVersetti,
} from './caricamento.ts'

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

export function useManifestTraduzioni(): Caricamento<ManifestTraduzioni> {
  return useRisorsa('translations/index', caricaManifestTraduzioni)
}

export function useTraduzione(id: string): Caricamento<Traduzione> {
  return useRisorsa(`translations/${id}`, () => caricaTraduzione(id))
}

/**
 * Tutte le traduzioni installate, per la ricerca full-text (F5.1): prima il
 * manifest, poi in parallelo ogni traduzione elencata (i fetch sono già dedupati
 * dalla cache di caricamento.ts). `attivo: false` evita di scaricare la Luzzi
 * intera finché la vista ricerca non si apre.
 */
export function useTuttiTesti(attivo: boolean): Caricamento<Traduzione[]> {
  const [esito, setEsito] = useState<Caricamento<Traduzione[]>>({ stato: 'in_corso' })
  useEffect(() => {
    if (!attivo) return
    let vivo = true
    setEsito({ stato: 'in_corso' })
    caricaManifestTraduzioni()
      .then((m) => Promise.all(m.disponibili.map((id) => caricaTraduzione(id))))
      .then((traduzioni) => {
        if (vivo) setEsito({ stato: 'pronto', dati: traduzioni })
      })
      .catch((e: unknown) => {
        if (vivo) setEsito({ stato: 'errore', messaggio: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      vivo = false
    }
  }, [attivo])
  return esito
}

/**
 * Gli id di tutti i versetti del Pentateuco, in un Set. Serve alla post-verifica
 * dell'assistente (F4.3) per distinguere un riferimento **inventato** da uno
 * **reale ma privo di testo curato**: entrambi restano non inseribili, ma dire
 * «inesistente nel dataset» di un versetto che il dataset contiene sarebbe falso,
 * e questa è un'app che sull'onestà di ciò che sa e non sa si regge tutta.
 * I cinque file pesano ~260 kB gzip in tutto — metà di embeddings.json, che la
 * stessa vista scarica comunque — e sono già in cache per il libro in lettura.
 */
export function useIdVersetti(attivo: boolean): Caricamento<Set<string>> {
  const [esito, setEsito] = useState<Caricamento<Set<string>>>({ stato: 'in_corso' })
  useEffect(() => {
    if (!attivo) return
    let vivo = true
    setEsito({ stato: 'in_corso' })
    Promise.all(LIBRI.map((l) => caricaVersetti(l.codice)))
      .then((libri) => {
        if (vivo) setEsito({ stato: 'pronto', dati: new Set(libri.flatMap((l) => l.versetti.map((v) => v.id))) })
      })
      .catch((e: unknown) => {
        if (vivo) setEsito({ stato: 'errore', messaggio: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      vivo = false
    }
  }, [attivo])
  return esito
}

/** `attivo: false` evita di scaricare i ~2 MB dell'indice finché non serve. */
export function useIndiceLemmi(attivo: boolean): Caricamento<IndiceLemmi> {
  return useRisorsa(attivo ? 'indices/lemmi' : '', () =>
    attivo ? caricaIndiceLemmi() : new Promise<IndiceLemmi>(() => {}),
  )
}

// I tre file di curation sono unici per tutto il Pentateuco e servono alla
// colonna contesto fin dal primo scroll: si caricano insieme alla vista lettura.
export function useEventi(): Caricamento<Eventi> {
  return useRisorsa('events', caricaEventi)
}

export function useLuoghi(): Caricamento<Luoghi> {
  return useRisorsa('places', caricaLuoghi)
}

export function usePersone(): Caricamento<Persone> {
  return useRisorsa('people', caricaPersone)
}

/** Le note stanno a margine del testo: servono appena la vista lettura si apre. */
export function useNote(): Caricamento<Note> {
  return useRisorsa('notes', caricaNote)
}

/** Come sopra: le glosse italiane servono solo a pannello parola aperto. */
export function useLexiconIt(attivo: boolean): Caricamento<LexiconIt> {
  return useRisorsa(attivo ? 'lexicon_it' : '', () =>
    attivo ? caricaLexiconIt() : new Promise<LexiconIt>(() => {}),
  )
}

/** I vettori (~1,6 MB) servono solo all'assistente: si scaricano alla sua apertura. */
export function useEmbeddings(attivo: boolean): Caricamento<Embeddings> {
  return useRisorsa(attivo ? 'embeddings' : '', () =>
    attivo ? caricaEmbeddings() : new Promise<Embeddings>(() => {}),
  )
}
