// embeddings.json — [G], derivato dalla curation. SCHEMI-DATI.md §2.10.

import { z } from 'zod'

/** ref è un id versetto quando tipo = "versetto", un id nota quando tipo = "nota". */
export const VoceEmbedding = z.object({
  tipo: z.enum(['versetto', 'nota']),
  ref: z.string(),
  v: z.array(z.number()),
})
export type VoceEmbedding = z.infer<typeof VoceEmbedding>

export const MetaEmbeddings = z.object({
  modello: z.string(),
  dim: z.number().int().positive(),
  normalizzati: z.boolean(),
  testo_sorgente: z.string(),
  generato: z.iso.date(),
})
export type MetaEmbeddings = z.infer<typeof MetaEmbeddings>

export const Embeddings = z.object({
  meta: MetaEmbeddings,
  voci: z.array(VoceEmbedding),
})
export type Embeddings = z.infer<typeof Embeddings>
