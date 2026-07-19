// places.json — [C] (bootstrap: TIPNR + OpenBible.info geo). SCHEMI-DATI.md §2.3.

import { z } from 'zod'
import { Confidenza, Fonte, Nomi, SlugId, VersettoId } from './comune.ts'

export const CandidatoLuogo = z.object({
  id: SlugId,
  etichetta: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  pro: z.array(z.string()),
  contro: z.array(z.string()),
  // Punteggio di confidenza del dataset OpenBible (0-1): distinto dallo `status` critico assegnato in curation.
  // Assente = candidato non presente nel dataset OpenBible; mai inventare un punteggio.
  peso_openbible: z.number().min(0).max(1).optional(),
  fonti: z.array(Fonte),
})
export type CandidatoLuogo = z.infer<typeof CandidatoLuogo>

export const Luogo = z.object({
  id: SlugId,
  // Chiave TIPNR d'origine; null per voci curate a mano senza corrispondenza TIPNR.
  tipnr_id: z.string().nullable(),
  nomi: Nomi,
  status: Confidenza,
  // Con status "symbolic" i candidati possono mancare del tutto (es. Eden).
  candidati: z.array(CandidatoLuogo),
  riferimenti: z.array(VersettoId),
  fonti: z.array(Fonte),
  da_verificare: z.boolean(),
})
export type Luogo = z.infer<typeof Luogo>
