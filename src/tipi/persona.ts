// people.json — [C] (bootstrap: TIPNR). SCHEMI-DATI.md §2.4.

import { z } from 'zod'
import { Fonte, Nomi, SlugId, VersettoId } from './comune.ts'

/** Relazioni familiari denormalizzate: la reciprocità (padre↔figli) è controllata dal validatore, non dallo schema. */
export const Relazioni = z.object({
  padre: SlugId.nullable(),
  madre: SlugId.nullable(),
  coniugi: z.array(SlugId),
  figli: z.array(SlugId),
})
export type Relazioni = z.infer<typeof Relazioni>

/** Età letterali del TM dove il testo le dà — dato narrativo, non storico. */
export const DatiNarrativi = z.object({
  eta_totale: z.number().int().positive().nullable(),
  eta_al_primo_figlio: z.number().int().positive().nullable(),
  versetti: z.array(VersettoId),
})
export type DatiNarrativi = z.infer<typeof DatiNarrativi>

export const Persona = z.object({
  id: SlugId,
  // Chiave TIPNR d'origine; null per voci curate a mano senza corrispondenza TIPNR.
  tipnr_id: z.string().nullable(),
  nomi: Nomi,
  relazioni: Relazioni,
  riferimenti: z.array(VersettoId),
  // Null per le persone di cui il TM non dà età letterali.
  dati_narrativi: DatiNarrativi.nullable(),
  fonti: z.array(Fonte),
  da_verificare: z.boolean(),
})
export type Persona = z.infer<typeof Persona>
