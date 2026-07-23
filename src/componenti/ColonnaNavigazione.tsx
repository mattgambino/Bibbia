// src/componenti/ColonnaNavigazione.tsx — colonna sinistra: libro, capitolo,
// traduzione a fronte (ROADMAP F1.6b).

import { LIBRI } from '../lib/riferimenti.ts'
import type { Posizione } from '../lib/riferimenti.ts'
import type { CodiceLibro } from '../tipi/index.ts'

type Props = {
  posizione: Posizione
  onPosizione: (p: Posizione) => void
  traduzioni: { id: string; nome: string }[]
  traduzione: string
  onTraduzione: (id: string) => void
  /** Apre il modulo assistente RAG (F4.2). */
  onAssistente: () => void
}

export function ColonnaNavigazione({
  posizione,
  onPosizione,
  traduzioni,
  traduzione,
  onTraduzione,
  onAssistente,
}: Props) {
  const capitoli = LIBRI.find((l) => l.codice === posizione.libro)!.capitoli

  // Cambiando libro si riparte dal capitolo 1: il capitolo corrente potrebbe
  // non esistere nel libro di destinazione.
  const cambiaLibro = (libro: CodiceLibro) => onPosizione({ libro, capitolo: 1 })

  return (
    <nav className="navigazione" aria-label="Navigazione del testo">
      <p className="marchio">Pentateuco in contesto</p>

      <p className="etichetta" id="etichetta-libri">
        Libro
      </p>
      <ul className="libri" aria-labelledby="etichetta-libri">
        {LIBRI.map((libro) => (
          <li key={libro.codice}>
            <button
              type="button"
              aria-current={libro.codice === posizione.libro}
              onClick={() => cambiaLibro(libro.codice)}
            >
              {libro.nome}
            </button>
          </li>
        ))}
      </ul>

      <p className="etichetta" id="etichetta-capitoli">
        Capitolo
      </p>
      <div className="capitoli" role="group" aria-labelledby="etichetta-capitoli">
        {Array.from({ length: capitoli }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === posizione.capitolo}
            aria-label={`Capitolo ${n}`}
            onClick={() => onPosizione({ libro: posizione.libro, capitolo: n })}
          >
            {n}
          </button>
        ))}
      </div>

      <p className="etichetta">
        <label htmlFor="selettore-traduzione">Traduzione a fronte</label>
      </p>
      <select
        id="selettore-traduzione"
        className="selettore"
        value={traduzione}
        onChange={(e) => onTraduzione(e.target.value)}
      >
        {traduzioni.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>

      <button type="button" className="apri-assistente" onClick={onAssistente}>
        Assistente
      </button>
    </nav>
  )
}
