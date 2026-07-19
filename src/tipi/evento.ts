// events.json — [C]. SCHEMI-DATI.md §2.5.

import { z } from 'zod'
import { Confidenza, Fonte, RangeAnni, RangeVersetti, SlugId, VersettoId } from './comune.ts'

/**
 * Cronologia interna del racconto (numeri TM). Non porta `confidence`: è un dato testuale,
 * certo in quanto testo, non un'affermazione storica — vedi tempo_storico per quello.
 */
export const TempoNarrato = z.object({
  am: RangeAnni.nullable(),
  riferimenti_interni: z.array(VersettoId),
  nota: z.string().nullable(),
})
export type TempoNarrato = z.infer<typeof TempoNarrato>

/** Ancoraggio storico-critico, se esiste; `ancoraggio: null` + `confidence` qualifica anche l'assenza di ancoraggio. */
export const TempoStorico = z.object({
  ancoraggio: RangeAnni.nullable(),
  confidence: Confidenza,
  sintesi: z.string(),
  fonti: z.array(Fonte),
})
export type TempoStorico = z.infer<typeof TempoStorico>

export const PosizioneComposizione = z.object({
  etichetta: z.string(),
  sintesi: z.string(),
  fonti: z.array(Fonte),
})
export type PosizioneComposizione = z.infer<typeof PosizioneComposizione>

/** Il ventaglio del dibattito su datazione/redazione, mai una sola scuola. */
export const Composizione = z.object({
  range: RangeAnni,
  posizioni: z.array(PosizioneComposizione),
})
export type Composizione = z.infer<typeof Composizione>

export const Evento = z.object({
  id: SlugId,
  titolo: z.string(),
  range: RangeVersetti,
  persone: z.array(SlugId),
  luoghi: z.array(SlugId),
  tempo_narrato: TempoNarrato,
  tempo_storico: TempoStorico,
  composizione: Composizione,
  fonti: z.array(Fonte),
  da_verificare: z.boolean(),
})
export type Evento = z.infer<typeof Evento>
