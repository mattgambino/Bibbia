// src/componenti/BinarioTempo.tsx — un binario della timeline (ROADMAP F3.2).
//
// Un binario è un asse temporale e basta: la sua scala, le sue corsie, la sua
// unità di conto. Tre di questi componenti stanno uno sotto l'altro nella vista,
// e non condividono nulla se non l'ordine delle corsie — che è l'ordine del
// testo. Nessun asse comune, nessuna scala condivisa: è il vincolo della
// specifica §3.1, e il modo più semplice di non violarlo è che il componente
// non sappia nemmeno che esistono gli altri due.
//
// D3 entra qui solo per la matematica della scala (`scalaAnni` in lib/tempo.ts):
// il DOM lo scrive React, come per il popup della mappa. Un `d3.select` sopra
// nodi che React possiede è la strada breve per due padroni sullo stesso albero.

import { useEffect, useRef, useState } from 'react'
import { riferimentoBreve, scalaAnni } from '../lib/tempo.ts'
import type { Binario } from '../lib/tempo.ts'

/** Corsia delle etichette, dentro l'SVG: il riferimento sta a sinistra della scala, non sopra la barra. */
const CORSIA_ETICHETTE = 76
/** Spazio a destra: l'ultima cifra dell'asse deve poter uscire dall'ultima tacca. */
const MARGINE_DESTRO = 40
const ALTEZZA_RIGA = 26
/** Fascia dell'asse graduato, sotto le corsie. */
const ALTEZZA_ASSE = 30

/** Larghezza in pixel del contenitore: la scala si ridisegna quando la finestra cambia. */
function usaLarghezza(): [React.RefObject<HTMLDivElement | null>, number] {
  const contenitore = useRef<HTMLDivElement | null>(null)
  const [larghezza, setLarghezza] = useState(0)

  useEffect(() => {
    const elemento = contenitore.current
    if (!elemento) return
    const osservatore = new ResizeObserver(([voce]) => setLarghezza(voce.contentRect.width))
    osservatore.observe(elemento)
    setLarghezza(elemento.clientWidth)
    return () => osservatore.disconnect()
  }, [])

  return [contenitore, larghezza]
}

type Props = {
  binario: Binario
  /** Id della pericope scelta: la sua corsia si marca su tutti e tre i binari. */
  scelta: string | null
  onSceglie: (id: string) => void
}

export function BinarioTempo({ binario, scelta, onSceglie }: Props) {
  const [contenitore, larghezza] = usaLarghezza()
  const collocate = binario.collocazioni.filter((c) => c.range !== null)

  return (
    <section className="binario" aria-labelledby={`binario-${binario.id}`}>
      <div className="binario-testa">
        <h3 id={`binario-${binario.id}`}>{binario.titolo}</h3>
        <p className="binario-unita">{binario.unita}</p>
      </div>
      <p className="binario-glossa">{binario.glossa}</p>

      <div className="binario-tela" ref={contenitore}>
        {binario.dominio === null ? (
          // Nessun dominio: nessuna scala. Disegnare un righello qui vorrebbe
          // dire inventare gli estremi di un asse su cui non è collocato nulla.
          <p className="vuoto">
            Nessuna delle {binario.collocazioni.length} pericopi curate è collocata su questo asse: non c’è
            scala da disegnare. Il perché lo dice la curation, pericope per pericope, nella scheda a fianco.
          </p>
        ) : (
          larghezza > 0 && (
            <Grafico
              binario={binario}
              dominio={binario.dominio}
              larghezza={larghezza}
              scelta={scelta}
              onSceglie={onSceglie}
            />
          )
        )}
      </div>

      <p className="binario-conto">
        {collocate.length} di {binario.collocazioni.length} pericopi collocate ·{' '}
        <span className="binario-segno-nota">{binario.notaSegno}</span>
      </p>
    </section>
  )
}

function Grafico({
  binario,
  dominio,
  larghezza,
  scelta,
  onSceglie,
}: {
  binario: Binario
  dominio: { da: number; a: number }
  larghezza: number
  scelta: string | null
  onSceglie: (id: string) => void
}) {
  const utile = Math.max(larghezza - CORSIA_ETICHETTE - MARGINE_DESTRO, 40)
  const { x, tacche } = scalaAnni(dominio, utile)
  const px = (anno: number) => CORSIA_ETICHETTE + x(anno)

  const altezza = binario.collocazioni.length * ALTEZZA_RIGA + ALTEZZA_ASSE
  const yAsse = binario.collocazioni.length * ALTEZZA_RIGA + 8

  // Il testo alternativo dice in parole quello che la figura dice in geometria:
  // gli anni si leggono come li scrive la pagina («700 a.C.», mai «-700»).
  const descrizione = `Binario ${binario.titolo}, scala in ${binario.unita} da ${binario.etichetta(
    dominio.da,
  )} a ${binario.etichetta(dominio.a)}. ${
    binario.collocazioni.filter((c) => c.range).length
  } pericopi collocate su ${binario.collocazioni.length}.`

  return (
    <svg
      className="binario-grafico"
      width={larghezza}
      height={altezza}
      viewBox={`0 0 ${larghezza} ${altezza}`}
      role="img"
      aria-label={descrizione}
    >
      {/* Le tacche corrono per tutta l'altezza: sono il righello del binario,
          non un ornamento del suo bordo inferiore. */}
      {tacche.map((t) => (
        <line
          key={`griglia-${t}`}
          className="binario-griglia"
          x1={px(t)}
          x2={px(t)}
          y1={0}
          y2={yAsse}
        />
      ))}

      {binario.collocazioni.map((c, i) => {
        const y = i * ALTEZZA_RIGA
        const centro = y + ALTEZZA_RIGA / 2
        const attiva = c.evento.id === scelta
        const classe = [
          'binario-corsia',
          attiva ? 'binario-corsia--scelta' : '',
          scelta && !attiva ? 'binario-corsia--arretrata' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <g key={c.evento.id} className={classe} onClick={() => onSceglie(c.evento.id)}>
            <rect className="binario-corsia-fondo" x={0} y={y} width={larghezza} height={ALTEZZA_RIGA} />
            <text className="binario-corsia-etichetta" x={CORSIA_ETICHETTE - 10} y={centro} dy="0.32em">
              {riferimentoBreve(c.evento)}
            </text>
            {c.range === null ? (
              // La frase per esteso solo sulla corsia scelta: ripetuta su ogni
              // riga vuota diventava un muro di testo che copriva le poche
              // collocate (undici righe su dodici, con la curation di Gen 4-5).
              // L'assenza resta dichiarata dal trattino, dal conteggio sotto il
              // grafico e, per esteso, nella scheda della pericope.
              <text className="binario-corsia-vuota" x={CORSIA_ETICHETTE + 2} y={centro} dy="0.32em">
                {attiva ? '— senza collocazione su questo asse' : '—'}
              </text>
            ) : binario.segno === 'blocco' ? (
              <rect
                className="binario-blocco"
                x={px(c.range.da)}
                y={centro - 5}
                width={Math.max(px(c.range.a) - px(c.range.da), 3)}
                height={10}
                rx={1}
              />
            ) : (
              <Forcella
                classe={`binario-forcella${c.confidenza ? ` binario-forcella--${c.confidenza}` : ''}`}
                da={px(c.range.da)}
                a={px(c.range.a)}
                y={centro}
              />
            )}
          </g>
        )
      })}

      <line className="binario-asse" x1={CORSIA_ETICHETTE} x2={larghezza - MARGINE_DESTRO} y1={yAsse} y2={yAsse} />
      {tacche.map((t) => (
        <g key={`tacca-${t}`}>
          <line className="binario-tacca" x1={px(t)} x2={px(t)} y1={yAsse} y2={yAsse + 4} />
          <text className="binario-tacca-etichetta" x={px(t)} y={yAsse + 16} textAnchor="middle">
            {binario.etichetta(t)}
          </text>
        </g>
      ))}
    </svg>
  )
}

/**
 * Forcella: due limiti e ciò che sta in mezzo, senza riempimento. Un blocco
 * pieno direbbe che il valore occupa tutto l'intervallo; qui invece il valore
 * sta da qualche parte lì dentro e la distribuzione non la sappiamo.
 *
 * Se i due estremi coincidono i serif si sovrappongono: la figura si stringe
 * quanto il dato. Allargarla per non farla sembrare un punto vorrebbe dire
 * disegnare un'incertezza che i dati non dichiarano.
 */
function Forcella({ classe, da, a, y }: { classe: string; da: number; a: number; y: number }) {
  return (
    <g className={classe}>
      <line className="forcella-tratto" x1={da} x2={a} y1={y} y2={y} />
      <line className="forcella-limite" x1={da} x2={da} y1={y - 6} y2={y + 6} />
      <line className="forcella-limite" x1={a} x2={a} y1={y - 6} y2={y + 6} />
    </g>
  )
}
