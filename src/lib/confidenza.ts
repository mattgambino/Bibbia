// src/lib/confidenza.ts — resa in italiano della scala di confidenza (F2.2).
//
// I 5 valori sono quelli fissati dalla specifica §3.1 e non si estendono. Qui
// stanno solo l'etichetta leggibile e la glossa che ne spiega la portata: il
// colore e il segno di margine vivono nei token (`--status-*`, `--segno-*`),
// così badge, marker della mappa e note parlano la stessa lingua.

import type { Confidenza } from '../tipi/index.ts'

export const ETICHETTA_CONFIDENZA: Record<Confidenza, string> = {
  consensus: 'consenso',
  majority: 'maggioritaria',
  disputed: 'contesa',
  speculative: 'speculativa',
  symbolic: 'simbolica',
}

export const GLOSSA_CONFIDENZA: Record<Confidenza, string> = {
  consensus: 'Consenso ampio negli studi.',
  majority: 'Posizione maggioritaria, con dissensi motivati.',
  disputed: 'Questione aperta: ipotesi concorrenti senza prevalenza.',
  speculative: 'Ipotesi minoritaria o congetturale.',
  symbolic: 'Riferimento simbolico o letterario, non localizzabile né databile.',
}
