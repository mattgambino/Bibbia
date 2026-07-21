// src/lib/confidenza.ts — resa in italiano della scala di confidenza (F2.2).
//
// I 5 valori storico-critici sono quelli fissati dalla specifica §3.1 e non si
// estendono. `attribuito` sta a parte: non è un grado di consenso ma il marchio
// delle note della tradizione ebraica, dove ciò che conta è chi parla (vedi
// Confidenza in src/tipi/comune.ts). Qui stanno solo l'etichetta leggibile e la
// glossa che ne spiega la portata: il colore e il segno di margine vivono nei
// token (`--status-*`, `--segno-*`), così badge, marker della mappa e note
// parlano la stessa lingua.

import type { Confidenza } from '../tipi/index.ts'

export const ETICHETTA_CONFIDENZA: Record<Confidenza, string> = {
  consensus: 'consenso',
  majority: 'maggioritaria',
  disputed: 'contesa',
  speculative: 'speculativa',
  symbolic: 'simbolica',
  attribuito: 'attribuita',
}

export const GLOSSA_CONFIDENZA: Record<Confidenza, string> = {
  consensus: 'Consenso ampio negli studi.',
  majority: 'Posizione maggioritaria, con dissensi motivati.',
  disputed: 'Questione aperta: ipotesi concorrenti senza prevalenza.',
  speculative: 'Ipotesi minoritaria o congetturale.',
  symbolic: 'Riferimento simbolico o letterario, non localizzabile né databile.',
  attribuito: 'Lettura attribuita a un’autorità della tradizione: fuori dalla scala del consenso accademico.',
}
