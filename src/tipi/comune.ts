// Tipi condivisi tra tutti gli schemi dati — SCHEMI-DATI.md §1.

import { z } from 'zod'

/** Codici libro del Pentateuco, usati in tutti gli id. */
export const CodiceLibro = z.enum(['gen', 'exo', 'lev', 'num', 'deu'])
export type CodiceLibro = z.infer<typeof CodiceLibro>

/** Id versetto TM: libro.capitolo.versetto (es. "gen.1.1"). */
export const VersettoId = z
  .string()
  .regex(/^(gen|exo|lev|num|deu)\.\d+\.\d+$/, 'id versetto non valido (atteso libro.capitolo.versetto)')
export type VersettoId = z.infer<typeof VersettoId>

/** Id parola: id versetto + posizione a due cifre (es. "gen.1.1.01"). */
export const ParolaId = z
  .string()
  .regex(/^(gen|exo|lev|num|deu)\.\d+\.\d+\.\d{2}$/, 'id parola non valido (atteso libro.capitolo.versetto.pos)')
export type ParolaId = z.infer<typeof ParolaId>

/** Id di un'entità curata (luogo, persona, evento, nota): slug minuscolo ASCII, con eventuale disambiguatore punteggiato (es. "lemek.gen4"). */
export const SlugId = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    'slug non valido (atteso minuscolo ascii, parole separate da "-", disambiguatore separato da ".")',
  )
export type SlugId = z.infer<typeof SlugId>

/**
 * Riferimento biblico generico (usato nei crossref, dove la destinazione può uscire dal Pentateuco).
 * Ammette anche codici con cifra iniziale (es. "1sa.3.1"); verifica finale dell'insieme dei codici reali rimandata a F1.5.
 */
export const RiferimentoBiblico = z
  .string()
  .regex(/^(?:\d[a-z]{2}|[a-z]{3})\.\d+\.\d+$/, 'riferimento biblico non valido (atteso lib.capitolo.versetto)')
export type RiferimentoBiblico = z.infer<typeof RiferimentoBiblico>

/**
 * Scala di confidenza — specifica §3.1. Usata da places.status, notes.confidence,
 * events.tempo_storico.confidence.
 *
 * I primi cinque valori misurano lo stato del dibattito storico-critico. `attribuito` non è
 * un sesto grado della stessa scala: è il valore delle note `tradizione_ebraica`, dove il
 * dato non è "quanto consenso raccoglie" ma "chi lo dice". Un commento di Rashi non è né
 * consenso né congettura: è un'attribuzione a un'autorità della tradizione. `valida.ts`
 * tiene le due cose separate (tradizione_ebraica ⇔ attribuito, e mai altrove).
 */
export const Confidenza = z.enum(['consensus', 'majority', 'disputed', 'speculative', 'symbolic', 'attribuito'])
export type Confidenza = z.infer<typeof Confidenza>

/** Fonte citata da un claim curato. */
export const Fonte = z
  .object({
    tipo: z.enum(['opera', 'url', 'dataset']),
    autore: z.string().optional(),
    titolo: z.string(),
    anno: z.number().int().optional(),
    url: z.url().optional(),
    dettaglio: z.string().optional(),
  })
  .refine((f) => f.tipo !== 'url' || !!f.url, {
    message: 'url obbligatorio quando tipo = "url"',
    path: ['url'],
  })
export type Fonte = z.infer<typeof Fonte>

/** Range di versetti, estremi inclusi. */
export const RangeVersetti = z.object({
  da: VersettoId,
  a: VersettoId,
})
export type RangeVersetti = z.infer<typeof RangeVersetti>

/** Range di anni (interi; negativo = a.e.v.). */
export const RangeAnni = z.object({
  da: z.number().int(),
  a: z.number().int(),
})
export type RangeAnni = z.infer<typeof RangeAnni>

/** Nomi in ebraico/traslitterazione/italiano — luoghi e persone. */
export const Nomi = z.object({
  he: z.string(),
  translit: z.string(),
  it: z.string(),
})
export type Nomi = z.infer<typeof Nomi>

/** Blocco meta dei file generati [G] da TAHOT/TSK (fonte, licenza, data, script d'origine). */
export const MetaGenerato = z.object({
  fonte: z.string(),
  licenza: z.string(),
  generato: z.iso.date(),
  script: z.string(),
})
export type MetaGenerato = z.infer<typeof MetaGenerato>
