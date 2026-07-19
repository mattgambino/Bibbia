// verses/<libro>.json — [G] TAHOT. SCHEMI-DATI.md §2.1.

import { z } from 'zod'
import { CodiceLibro, MetaGenerato, ParolaId, VersettoId } from './comune.ts'

export const Versetto = z.object({
  id: VersettoId,
  capitolo: z.number().int().positive(),
  numero: z.number().int().positive(),
  parole: z.array(ParolaId),
})
export type Versetto = z.infer<typeof Versetto>

export const LibroVersetti = z.object({
  meta: MetaGenerato,
  libro: CodiceLibro,
  nome_it: z.string(),
  capitoli: z.number().int().positive(),
  versetti: z.array(Versetto),
})
export type LibroVersetti = z.infer<typeof LibroVersetti>
