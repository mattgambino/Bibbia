// src/componenti/AlberoGenealogico.tsx — il disegno di un albero genealogico (F3.3).
//
// Divisione del lavoro come nella timeline (F3.2): d3-hierarchy calcola le
// posizioni, React possiede il DOM. `d3.tree` dà la matematica della disposizione
// (Reingold–Tilford: nessuna sovrapposizione, sottoalberi compatti); i nodi sono
// `<foreignObject>` con dentro un vero `<button>`, così restano raggiungibili da
// tastiera e stilabili con i token, invece di essere testo SVG inerte.
//
// L'albero cresce da sinistra a destra: una generazione per colonna, i fratelli
// impilati in verticale. È la forma che regge sia le catene quasi lineari di
// Gen 5 e 11 sia la tavola larga di Gen 10, e cresce in altezza (scroll naturale)
// invece che in larghezza.
//
// Radici multiple = tronchi separati. Si dispongono tutte sotto una radice
// virtuale che *non* si disegna e da cui *non* parte alcun arco: i frammenti
// restano staccati, perché staccati sono nei dati.

import { useMemo } from 'react'
import { hierarchy, tree } from 'd3-hierarchy'
import { etichettaEta, nomePersona } from '../lib/genealogia.ts'
import type { Albero, NodoPersona } from '../lib/genealogia.ts'
import type { Nota, Persona } from '../tipi/index.ts'

const BOX_W = 158
const BOX_H = 46
const GAP_GEN = 210 // distanza fra colonne di generazione
const GAP_FRAT = 56 // distanza fra fratelli
const MARGINE = 10

type NodoVirtuale = { persona: Persona | null; figli: NodoPersona[] }

type Props = {
  albero: Albero
  selezione: string | null
  notePerFigura: Map<string, Nota[]>
  onSeleziona: (id: string) => void
}

export function AlberoGenealogico({ albero, selezione, notePerFigura, onSeleziona }: Props) {
  const disposizione = useMemo(() => {
    // Radice virtuale: tiene insieme lo spazio verticale dei tronchi senza
    // legarli. `figli` accetta sia il finto nodo sia i NodoPersona reali.
    const radice = hierarchy<NodoVirtuale>(
      { persona: null, figli: albero.radici },
      (d) => (d as NodoVirtuale).figli as NodoVirtuale[],
    )
    // `tree()` restituisce il nodo con x/y numerici (HierarchyPointNode): va
    // usato quello, non `radice`, dove x/y sono ancora opzionali.
    const disposto = tree<NodoVirtuale>().nodeSize([GAP_FRAT, GAP_GEN])(radice)

    const reali = disposto.descendants().filter((d) => d.data.persona)
    if (reali.length === 0) return { nodi: [], archi: [], larghezza: 0, altezza: 0 }

    // `x` è la posizione trasversale (verticale), `depth` la generazione. La
    // radice virtuale è a depth 0, le radici vere a depth 1: si sottrae 1 perché
    // le radici vere partano dalla prima colonna.
    const minX = Math.min(...reali.map((d) => d.x))
    const schermoX = (d: (typeof reali)[number]) => MARGINE + (d.depth - 1) * GAP_GEN
    const schermoY = (d: (typeof reali)[number]) => MARGINE + (d.x - minX)

    const nodi = reali.map((d) => ({
      persona: d.data.persona!,
      x: schermoX(d),
      y: schermoY(d),
    }))

    // Archi solo fra nodi reali: un padre virtuale non genera linea.
    const archi = reali
      .filter((d) => d.parent && d.parent.data.persona)
      .map((d) => {
        const x1 = schermoX(d.parent!) + BOX_W
        const y1 = schermoY(d.parent!) + BOX_H / 2
        const x2 = schermoX(d)
        const y2 = schermoY(d) + BOX_H / 2
        const mx = (x1 + x2) / 2
        return { chiave: d.data.persona!.id, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }
      })

    const larghezza = Math.max(...nodi.map((n) => n.x)) + BOX_W + MARGINE
    const altezza = Math.max(...nodi.map((n) => n.y)) + BOX_H + MARGINE
    return { nodi, archi, larghezza, altezza }
  }, [albero])

  if (disposizione.nodi.length === 0) {
    return <p className="vuoto">Nessuna figura da disegnare per questa genealogia.</p>
  }

  return (
    <div className="albero-scorri">
      <svg
        className="albero"
        width={disposizione.larghezza}
        height={disposizione.altezza}
        role="img"
        aria-label={`Albero genealogico: ${albero.def.titolo}, ${albero.totale} figure`}
      >
        <g className="albero-archi">
          {disposizione.archi.map((a) => (
            <path key={a.chiave} d={a.d} fill="none" />
          ))}
        </g>
        {disposizione.nodi.map((n) => (
          <foreignObject key={n.persona.id} x={n.x} y={n.y} width={BOX_W} height={BOX_H}>
            <NodoScheda
              persona={n.persona}
              scelto={selezione === n.persona.id}
              note={notePerFigura.get(n.persona.id) ?? []}
              onSceglie={() => onSeleziona(n.persona.id)}
            />
          </foreignObject>
        ))}
      </svg>
    </div>
  )
}

/** Il riquadro di una figura: nome, età letterale se il testo la dà, marca delle note. */
function NodoScheda({
  persona,
  scelto,
  note,
  onSceglie,
}: {
  persona: Persona
  scelto: boolean
  note: Nota[]
  onSceglie: () => void
}) {
  const eta = etichettaEta(persona)
  return (
    <button
      type="button"
      className={`albero-nodo${scelto ? ' albero-nodo--scelto' : ''}${persona.da_verificare ? ' albero-nodo--verificare' : ''}`}
      aria-pressed={scelto}
      data-figura={persona.id}
      title={nomePersona(persona)}
      onClick={onSceglie}
    >
      <span className="albero-nome">{nomePersona(persona)}</span>
      {note.length > 0 && (
        <span
          className="albero-note-segno"
          aria-label={note.length === 1 ? '1 nota critica' : `${note.length} note critiche`}
        >
          {note.length}
        </span>
      )}
      {eta && <span className="albero-eta">{eta}</span>}
    </button>
  )
}
