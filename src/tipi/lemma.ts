// indices/lemmi.json [G] + lexicon_it.json [C] — dizionari chiave dStrong. SCHEMI-DATI.md §2.9.

import { z } from 'zod'
import { Fonte, MetaGenerato, ParolaId } from './comune.ts'

/** Chiave dStrong (es. "H7225"); lettera di disambiguazione finale opzionale. */
export const DStrongId = z
  .string()
  .regex(/^H\d{1,4}[A-Za-z]?$/, 'chiave dStrong non valida (attesa "H" + numero)')
export type DStrongId = z.infer<typeof DStrongId>

export const VoceLemma = z.object({
  lemma: z.string(),
  translit: z.string(),
  glossa_en: z.string(),
  occorrenze: z.array(ParolaId),
})
export type VoceLemma = z.infer<typeof VoceLemma>

/** indices/lemmi.json — derivato da TAHOT: blocco meta per l'attribuzione CC BY 4.0. */
export const IndiceLemmi = z.object({
  meta: MetaGenerato,
  lemmi: z.record(DStrongId, VoceLemma),
})
export type IndiceLemmi = z.infer<typeof IndiceLemmi>

export const VoceLexiconIt = z.object({
  glossa_it: z.string(),
  fonti: z.array(Fonte),
  da_verificare: z.boolean(),
})
export type VoceLexiconIt = z.infer<typeof VoceLexiconIt>

/** lexicon_it.json — solo i lemmi già curati; cresce per lemma, non per parola. */
export const LexiconIt = z.record(DStrongId, VoceLexiconIt)
export type LexiconIt = z.infer<typeof LexiconIt>
