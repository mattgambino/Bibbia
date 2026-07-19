// words/<libro>.json — [G] TAHOT. SCHEMI-DATI.md §2.2.

import { z } from 'zod'
import { MetaGenerato, ParolaId, VersettoId } from './comune.ts'

/** Segmentazione di prefisso/suffisso data da TAHOT (es. preposizione + sostantivo). */
export const Morfema = z.object({
  strong: z.string(),
  lemma: z.string(),
  glossa_en: z.string(),
})
export type Morfema = z.infer<typeof Morfema>

export const Parola = z.object({
  id: ParolaId,
  verso: VersettoId,
  pos: z.number().int().positive(),
  testo: z.string(),
  translit: z.string(),
  // Codice grammaticale grezzo TAHOT; la decodifica leggibile è responsabilità di src/lib/morfologia.ts a runtime.
  morph: z.string(),
  morfemi: z.array(Morfema),
  ketiv: z.string().nullable(),
  qere: z.string().nullable(),
})
export type Parola = z.infer<typeof Parola>

export const LibroParole = z.object({
  meta: MetaGenerato,
  parole: z.array(Parola),
})
export type LibroParole = z.infer<typeof LibroParole>
