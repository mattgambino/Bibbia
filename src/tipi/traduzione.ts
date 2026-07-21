// translations/*.json — schema pluggable, una traduzione per file. SCHEMI-DATI.md §2.7.

import { z } from 'zod'
import { Fonte, VersettoId } from './comune.ts'

/** translations/index.json — manifest [C] a mano delle traduzioni installate. */
export const ManifestTraduzioni = z.object({
  disponibili: z.array(z.string()),
})
export type ManifestTraduzioni = z.infer<typeof ManifestTraduzioni>

/**
 * Versetto TM che questa traduzione non può coprire perché la sua versificazione
 * d'origine non lo distingue (tipicamente due versetti TM fusi in uno solo).
 * Va dichiarato qui, con il motivo: il validatore accetta come "buco" solo ciò
 * che è dichiarato, così un'omissione accidentale resta un errore.
 */
export const LacunaTraduzione = z.object({
  id: VersettoId,
  motivo: z.string(),
})
export type LacunaTraduzione = z.infer<typeof LacunaTraduzione>

export const MetaTraduzione = z.object({
  id: z.string(),
  nome: z.string(),
  // Null per traduzioni senza un anno di pubblicazione univoco (es. la letterale, costruita in sessione).
  anno: z.number().int().nullable(),
  lingua: z.string(),
  licenza: z.string(),
  // false per la letterale finché copre solo i capitoli curati.
  completa: z.boolean(),
  // Provenienza. Assente sulla letterale (costruita in sessione, non importata).
  fonti: z.array(Fonte).optional(),
  // Avvertenze sulla fonte che non vanno perse tra una rigenerazione e l'altra
  // (es. metadata a monte incoerenti): non sono claim di curation.
  note: z.array(z.string()).optional(),
  // Presenti sui file [G] prodotti da uno script di import.
  generato: z.iso.date().optional(),
  script: z.string().optional(),
  // Ha senso solo con completa = true: i buchi noti e giustificati.
  lacune: z.array(LacunaTraduzione).optional(),
})
export type MetaTraduzione = z.infer<typeof MetaTraduzione>

/** Chiavi sempre id TM, già rimappate via TVTMS in fase di import. */
export const Traduzione = z.object({
  meta: MetaTraduzione,
  testi: z.record(VersettoId, z.string()),
})
export type Traduzione = z.infer<typeof Traduzione>
