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

/**
 * Una voce del dibattito sulla composizione del passo. Non porta `confidence`:
 * è il ventaglio delle posizioni, non una di esse, a dire quanto la questione sia
 * aperta — vedi la nota in `lib/tempo.ts` sull'asse composizione.
 *
 * `datazione` è la collocazione nel tempo che *quella* posizione propone, ed è
 * nullable perché molte posizioni non ne propongono affatto: un'attribuzione di
 * strato («materiale sacerdotale») o un argomento letterario dicono di che testo
 * si tratta, non di quando. Finché resta null la posizione non concorre
 * all'inviluppo, e il validatore non ha nulla da confrontare.
 */
export const PosizioneComposizione = z.object({
  etichetta: z.string(),
  sintesi: z.string(),
  datazione: RangeAnni.nullable(),
  fonti: z.array(Fonte),
})
export type PosizioneComposizione = z.infer<typeof PosizioneComposizione>

/**
 * Scelta editoriale del progetto sull'asse composizione — perché una pericope
 * porti una forbice sola su un testo che ne conterrebbe due, tipicamente.
 *
 * Sta fuori da `posizioni` perché non è una posizione della letteratura: nessuno
 * l'ha sostenuta, è il progetto a dichiararla. Per la stessa ragione non porta
 * `confidence` (non è un grado di consenso su un claim: non c'è claim) e le sue
 * `fonti` non contano nel controllo `fonti ↔ da_verificare` del validatore.
 * Se qui servisse una fonte, è il segno che nel testo è rimasta una premessa di
 * merito: quella va scissa e messa in `posizioni`, dove il controllo la vede.
 */
export const NotaDiMetodo = z.object({
  etichetta: z.string(),
  sintesi: z.string(),
  fonti: z.array(Fonte),
})
export type NotaDiMetodo = z.infer<typeof NotaDiMetodo>

/**
 * Il ventaglio del dibattito su datazione/redazione, mai una sola scuola.
 *
 * `range` resta un campo memorizzato e non calcolato: su alcune pericopi nessuna
 * posizione porta una `datazione`, e un inviluppo calcolato sarebbe vuoto proprio
 * dove l'incertezza è massima. È il validatore a legarlo alle posizioni — deve
 * contenerne ogni `datazione` — e a segnalare quanta parte della sua ampiezza
 * non è ancora sostenuta da nessuna di esse.
 */
export const Composizione = z.object({
  range: RangeAnni,
  posizioni: z.array(PosizioneComposizione),
  nota_di_metodo: NotaDiMetodo.nullable(),
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
