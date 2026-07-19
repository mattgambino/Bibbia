// translations/*.json — schema pluggable, una traduzione per file. SCHEMI-DATI.md §2.7.

import { z } from 'zod'
import { VersettoId } from './comune.ts'

/** translations/index.json — manifest [C] a mano delle traduzioni installate. */
export const ManifestTraduzioni = z.object({
  disponibili: z.array(z.string()),
})
export type ManifestTraduzioni = z.infer<typeof ManifestTraduzioni>

export const MetaTraduzione = z.object({
  id: z.string(),
  nome: z.string(),
  // Null per traduzioni senza un anno di pubblicazione univoco (es. la letterale, costruita in sessione).
  anno: z.number().int().nullable(),
  lingua: z.string(),
  licenza: z.string(),
  // false per la letterale finché copre solo i capitoli curati.
  completa: z.boolean(),
})
export type MetaTraduzione = z.infer<typeof MetaTraduzione>

/** Chiavi sempre id TM, già rimappate via TVTMS in fase di import. */
export const Traduzione = z.object({
  meta: MetaTraduzione,
  testi: z.record(VersettoId, z.string()),
})
export type Traduzione = z.infer<typeof Traduzione>
