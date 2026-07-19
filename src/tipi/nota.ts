// notes.json — [C]. SCHEMI-DATI.md §2.6.

import { z } from 'zod'
import { Confidenza, Fonte, ParolaId, RangeVersetti, SlugId, VersettoId } from './comune.ts'

/** Target polimorfo di una nota: cinque forme, discriminate dal campo `tipo`. */
export const TargetNota = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('versetto'), ref: VersettoId }),
  z.object({ tipo: z.literal('pericope'), ref: RangeVersetti }),
  z.object({ tipo: z.literal('luogo'), ref: SlugId }),
  z.object({ tipo: z.literal('persona'), ref: SlugId }),
  z.object({ tipo: z.literal('parola'), ref: ParolaId }),
])
export type TargetNota = z.infer<typeof TargetNota>

/**
 * Tipo della nota: `tradizione_ebraica` da un lato, gli altri quattro (storico-critici)
 * dall'altro — la separazione delle prospettive (specifica §3.5) passa da qui.
 */
export const TipoNota = z.enum([
  'filologica',
  'storica',
  'geografica',
  'tradizione_ebraica',
  'divergenza_traduttiva',
])
export type TipoNota = z.infer<typeof TipoNota>

export const Nota = z.object({
  id: SlugId,
  target: TargetNota,
  tipo: TipoNota,
  titolo: z.string(),
  testo: z.string(),
  confidence: Confidenza,
  // Valorizzati solo per tipo = "tradizione_ebraica" (es. "Rashi", "Rashi on Genesis 6:4:1").
  commentatore: z.string().nullable(),
  sefaria_ref: z.string().nullable(),
  fonti: z.array(Fonte),
  da_verificare: z.boolean(),
})
export type Nota = z.infer<typeof Nota>
