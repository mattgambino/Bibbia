// src/lib/tempo.ts — dai dati di events.json ai tre binari della timeline (F3.2).
//
// Tre scelte che reggono il file:
// 1. I tre assi non sono tre serie dello stesso grafico: sono tre grandezze
//    diverse (Anno Mundi, anni dell'era, anni dell'era) con tre domini calcolati
//    ciascuno sui propri dati. Nessuna funzione qui dentro mette insieme valori
//    di assi diversi, e non ne esiste una che restituisca "il tempo" di una
//    pericope in un numero solo.
// 2. Il dominio di un asse è quello **osservato nella curation**: nessun `nice()`
//    che allarghi la scala a cifre tonde, perché gli estremi sono un dato (fin
//    dove arriva ciò che è stato curato) e arrotondarli direbbe più del vero.
// 3. Un asse senza dominio non ha scala: si dichiara l'assenza, non si disegna
//    un righello inventato. È la stessa regola dei mini-assi della colonna
//    contesto (F2.2).

import { scaleLinear } from 'd3-scale'
import { etichettaAnni, etichettaAnniMundi, etichettaAnno, etichettaAnnoMundi } from './pericopi.ts'
import { chiaveVersetto, leggiVersettoId } from './riferimenti.ts'
import type { Confidenza, Evento, Nota, RangeAnni } from '../tipi/index.ts'

export type AsseId = 'narrato' | 'storico' | 'composizione'

/**
 * Il segno con cui una collocazione si disegna. Non è una scelta grafica: dice
 * che genere di affermazione è quel range.
 * - `blocco` — una durata dentro il racconto (dato testuale, estremi netti);
 * - `forcella` — un intervallo di incertezza: il valore sta da qualche parte lì
 *   dentro e la distribuzione non la conosciamo, quindi si segnano i limiti e
 *   non si riempie nulla.
 */
export type SegnoTempo = 'blocco' | 'forcella'

export type Collocazione = {
  evento: Evento
  /** null = questa pericope non è collocata su quest'asse. */
  range: RangeAnni | null
  /** Solo dove l'asse porta una confidenza (tempo_storico): altrove null. */
  confidenza: Confidenza | null
  /** La cifra in parole, o perché non c'è. Vale anche come testo accessibile. */
  valore: string
}

export type Binario = {
  id: AsseId
  titolo: string
  /** Che cosa misura quest'asse: sta accanto al titolo, non in una legenda a parte. */
  glossa: string
  /** L'unità di conto, che non è la stessa per i tre assi. */
  unita: string
  segno: SegnoTempo
  /** Che cosa vuol dire il segno su quest'asse. */
  notaSegno: string
  dominio: RangeAnni | null
  collocazioni: Collocazione[]
  etichetta: (n: number) => string
}

/** Estremi osservati su tutta la curation; null se non c'è nulla da collocare o se il range è un punto solo. */
function dominio(valori: (RangeAnni | null)[]): RangeAnni | null {
  const presenti = valori.filter((v): v is RangeAnni => v !== null)
  if (presenti.length === 0) return null
  const da = Math.min(...presenti.map((v) => v.da))
  const a = Math.max(...presenti.map((v) => v.a))
  return a > da ? { da, a } : null
}

/**
 * Riferimento compatto per la corsia di un binario: "1,1–2", "2,4–17". Il nome
 * del libro non ci sta e non serve — sta nella testata della vista — ma il
 * capitolo sì: senza, due pericopi di capitoli diversi sembrerebbero la stessa.
 */
export function riferimentoBreve(evento: Evento): string {
  const da = leggiVersettoId(evento.range.da)
  const a = leggiVersettoId(evento.range.a)
  if (!da || !a) return evento.range.da
  if (da.capitolo !== a.capitolo) return `${da.capitolo},${da.versetto}–${a.capitolo},${a.versetto}`
  if (da.versetto === a.versetto) return `${da.capitolo},${da.versetto}`
  return `${da.capitolo},${da.versetto}–${a.versetto}`
}

/** Ordine canonico: le pericopi stanno nell'ordine del testo, uguale su tutti e tre i binari. */
export function ordinaPericopi(eventi: readonly Evento[]): Evento[] {
  return [...eventi].sort((x, y) => (chiaveVersetto(x.range.da) ?? 0) - (chiaveVersetto(y.range.da) ?? 0))
}

/** I tre binari, sempre tutti e tre: un asse senza dati resta un asse, e lo dice. */
export function binari(eventi: readonly Evento[]): Binario[] {
  const ordinati = ordinaPericopi(eventi)

  return [
    {
      id: 'narrato',
      titolo: 'Tempo narrato',
      glossa:
        'Quando gli eventi accadono secondo il racconto, con le cronologie interne prese alla lettera come dato letterario.',
      unita: 'Anno Mundi',
      segno: 'blocco',
      notaSegno: 'Blocco pieno: durata dentro il racconto. Gli estremi sono netti perché il testo li dà.',
      dominio: dominio(ordinati.map((e) => e.tempo_narrato.am)),
      etichetta: etichettaAnnoMundi,
      collocazioni: ordinati.map((evento) => ({
        evento,
        range: evento.tempo_narrato.am,
        confidenza: null,
        valore: etichettaAnniMundi(evento.tempo_narrato.am) ?? 'Nessuna cifra di anni in questo passo.',
      })),
    },
    {
      id: 'storico',
      titolo: 'Ancoraggi storici',
      glossa:
        'Che cosa del narrato è ancorabile a una storia esterna verificabile. L’assenza di ancoraggio è essa stessa un’affermazione, e porta la sua confidenza.',
      unita: 'anni a.C./d.C.',
      segno: 'forcella',
      notaSegno:
        'Forcella: intervallo di incertezza. Gli estremi sono i limiti proposti, non l’inizio e la fine di qualcosa.',
      dominio: dominio(ordinati.map((e) => e.tempo_storico.ancoraggio)),
      etichetta: etichettaAnno,
      collocazioni: ordinati.map((evento) => ({
        evento,
        range: evento.tempo_storico.ancoraggio,
        confidenza: evento.tempo_storico.confidence,
        valore: etichettaAnni(evento.tempo_storico.ancoraggio) ?? 'Nessun ancoraggio storico.',
      })),
    },
    {
      id: 'composizione',
      titolo: 'Composizione dei testi',
      glossa:
        'Quando il testo è stato scritto e redatto. Asse indipendente dai due precedenti: un passo può narrare le origini ed essere stato scritto tardi.',
      unita: 'anni a.C./d.C.',
      segno: 'forcella',
      notaSegno:
        'Forcella: la forbice del dibattito, non una durata. Le scuole in campo stanno nella scheda della pericope.',
      dominio: dominio(ordinati.map((e) => e.composizione.range)),
      etichetta: etichettaAnno,
      collocazioni: ordinati.map((evento) => ({
        evento,
        range: evento.composizione.range,
        // La composizione non porta un valore di confidenza nello schema: il
        // ventaglio delle posizioni è il modo in cui questo asse dice l'incertezza.
        confidenza: null,
        valore: etichettaAnni(evento.composizione.range) ?? 'Nessuna datazione proposta.',
      })),
    },
  ]
}

/**
 * Scala di un binario. `d3-scale` per la conversione anno→pixel e per la scelta
 * delle tacche: un passo tondo scelto bene è l'unica cosa che renda una scala
 * misurabile a occhio, e non vale la pena riscriverne l'algoritmo.
 */
export function scalaAnni(dominio: RangeAnni, larghezza: number) {
  const scala = scaleLinear().domain([dominio.da, dominio.a]).range([0, larghezza])
  // Una tacca ogni ~110px: sotto, le cifre degli anni si toccano.
  const tacche = scala.ticks(Math.max(2, Math.round(larghezza / 110)))
  return { x: (n: number) => scala(n), tacche }
}

/**
 * Le note curate che parlano di questa pericope: quelle il cui target `pericope`
 * cade dentro il suo range. Non tutte le note dei versetti compresi — quelle
 * sono apparato della lettura e qui sommergerebbero la scheda; una nota di
 * pericope invece parla proprio dell'unità che la timeline colloca.
 */
export function notePericope(note: readonly Nota[], evento: Evento): Nota[] {
  const da = chiaveVersetto(evento.range.da)
  const a = chiaveVersetto(evento.range.a)
  if (da === null || a === null) return []
  return note.filter((n) => {
    if (n.target.tipo !== 'pericope') return false
    const nda = chiaveVersetto(n.target.ref.da)
    const na = chiaveVersetto(n.target.ref.a)
    return nda !== null && na !== null && nda >= da && na <= a
  })
}
