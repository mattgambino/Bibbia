// crossrefs/<libro>.json — [G] TSK, arricchibile in curation. SCHEMI-DATI.md §2.8.

import { z } from 'zod'
import { MetaGenerato, RiferimentoBiblico, VersettoId } from './comune.ts'

/** Valorizzato solo in curation; null finché il riferimento non è stato classificato. */
export const TipoCrossref = z.enum(['citazione', 'allusione', 'parallelo_tematico'])
export type TipoCrossref = z.infer<typeof TipoCrossref>

export const Crossref = z.object({
  da: VersettoId,
  // Può uscire dal Pentateuco (es. "psa.33.6"): visibile come etichetta non navigabile in UI.
  a: RiferimentoBiblico,
  interno: z.boolean(),
  tipo: TipoCrossref.nullable(),
  curato: z.boolean(),
})
export type Crossref = z.infer<typeof Crossref>

export const LibroCrossref = z.object({
  meta: MetaGenerato,
  riferimenti: z.array(Crossref),
})
export type LibroCrossref = z.infer<typeof LibroCrossref>
