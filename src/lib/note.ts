// src/lib/note.ts — dalle note curate al testo che le porta a margine (F2.4).
//
// Le note hanno cinque target diversi (versetto, pericope, parola, luogo,
// persona) ma un solo posto in cui comparire nella colonna centrale: il margine
// del versetto. Qui si fa la riduzione, una volta sola per caricamento:
// - `parola` → il versetto che contiene la parola (e resta l'ancoraggio esatto,
//   che serve a marcare la parola nel testo ebraico);
// - `pericope` → il primo versetto del range, non tutti: un segno ripetuto per
//   dieci versetti direbbe "dieci note" invece di "una nota su questo passo";
// - `luogo` e `persona` → nessun versetto: quelle note appartengono all'entità e
//   compaiono nella sua scheda, nella colonna contesto.

import { etichettaRange } from './pericopi.ts'
import { etichettaVersetto, versettoDiParola } from './riferimenti.ts'
import type { Nota, TipoNota } from '../tipi/index.ts'

/** Etichetta italiana del tipo, per il pannello. */
export const ETICHETTA_TIPO_NOTA: Record<TipoNota, string> = {
  filologica: 'filologica',
  storica: 'storica',
  geografica: 'geografica',
  tradizione_ebraica: 'tradizione ebraica',
  divergenza_traduttiva: 'divergenza traduttiva',
}

/**
 * Sigla del tipo per l'indicatore a margine: una lettera, come le sigle di un
 * apparato a stampa. Il tipo sta nella lettera, la confidenza nel segno
 * geometrico che la accompagna — due dimensioni, due canali, nessuno dei due
 * affidato al solo colore.
 */
export const SIGLA_TIPO_NOTA: Record<TipoNota, string> = {
  filologica: 'F',
  storica: 'S',
  geografica: 'G',
  tradizione_ebraica: 'T',
  divergenza_traduttiva: 'D',
}

/** Le due prospettive della specifica §3.5: etichettate, mai fuse e mai gerarchizzate. */
export type Prospettiva = 'critica' | 'tradizione'

export function prospettivaDi(nota: Nota): Prospettiva {
  return nota.tipo === 'tradizione_ebraica' ? 'tradizione' : 'critica'
}

export const ETICHETTA_PROSPETTIVA: Record<Prospettiva, string> = {
  critica: 'prospettiva storico-critica',
  tradizione: 'tradizione ebraica',
}

/**
 * URL della fonte su Sefaria a partire dal `sefaria_ref` della nota.
 * Forma canonica verificata sul sito (200 diretto, senza redirect): spazi in
 * underscore, `:` in punto, e punto anche davanti alla prima cifra —
 * "Rashi on Genesis 1:1:1" → "Rashi_on_Genesis.1.1.1". Si linka soltanto: del
 * commento non entra nel dataset nemmeno una riga (decisione di F2.1 sui
 * termini d'uso, licenza per singola versione).
 */
export function urlSefaria(ref: string): string {
  const percorso = ref.trim().replace(/:/g, '.').replace(/\s+(?=\d)/, '.').replace(/\s+/g, '_')
  return `https://www.sefaria.org/${encodeURI(percorso)}`
}

/** Dove è ancorata la nota, in italiano leggibile. */
export function etichettaAncoraggio(nota: Nota): string {
  switch (nota.target.tipo) {
    case 'versetto':
      return etichettaVersetto(nota.target.ref)
    case 'pericope':
      return etichettaRange(nota.target.ref.da, nota.target.ref.a)
    case 'parola':
      // La posizione è a due cifre nell'id (…1.1.03) ma si legge come numero.
      return `${etichettaVersetto(versettoDiParola(nota.target.ref))}, parola ${Number(nota.target.ref.split('.')[3])}`
    case 'luogo':
      return `luogo: ${nota.target.ref}`
    case 'persona':
      return `persona: ${nota.target.ref}`
  }
}

export type IndiceNote = {
  /** Note da mostrare a margine di quel versetto (comprese quelle di parola e di pericope). */
  perVersetto: Map<string, Nota[]>
  /** Note ancorate a una parola precisa: servono a marcarla nel testo ebraico. */
  perParola: Map<string, Nota[]>
  perLuogo: Map<string, Nota[]>
  perPersona: Map<string, Nota[]>
}

function aggiungi(mappa: Map<string, Nota[]>, chiave: string, nota: Nota) {
  const elenco = mappa.get(chiave)
  if (elenco) elenco.push(nota)
  else mappa.set(chiave, [nota])
}

export function indicizzaNote(note: readonly Nota[]): IndiceNote {
  const indice: IndiceNote = {
    perVersetto: new Map(),
    perParola: new Map(),
    perLuogo: new Map(),
    perPersona: new Map(),
  }

  for (const nota of note) {
    switch (nota.target.tipo) {
      case 'versetto':
        aggiungi(indice.perVersetto, nota.target.ref, nota)
        break
      case 'pericope':
        aggiungi(indice.perVersetto, nota.target.ref.da, nota)
        break
      case 'parola':
        aggiungi(indice.perParola, nota.target.ref, nota)
        aggiungi(indice.perVersetto, versettoDiParola(nota.target.ref), nota)
        break
      case 'luogo':
        aggiungi(indice.perLuogo, nota.target.ref, nota)
        break
      case 'persona':
        aggiungi(indice.perPersona, nota.target.ref, nota)
        break
    }
  }

  return indice
}
