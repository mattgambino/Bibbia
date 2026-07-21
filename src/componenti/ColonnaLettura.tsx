// src/componenti/ColonnaLettura.tsx — colonna centrale: ebraico word-level
// cliccabile e traduzione a fronte, versetto per versetto (ROADMAP F1.6b).

import { versettoDiParola } from '../lib/riferimenti.ts'
import type { Parola, Traduzione, Versetto } from '../tipi/index.ts'

type Props = {
  titolo: string
  fonte: string
  versetti: Versetto[]
  parolePerId: Map<string, Parola>
  traduzione: Traduzione | null
  parolaAttiva: string | null
  /** Parole del capitolo che condividono un lemma con la parola attiva. */
  paroleDelLemma: ReadonlySet<string>
  onParola: (id: string) => void
}

export function ColonnaLettura({
  titolo,
  fonte,
  versetti,
  parolePerId,
  traduzione,
  parolaAttiva,
  paroleDelLemma,
  onParola,
}: Props) {
  const lacune = new Map((traduzione?.meta.lacune ?? []).map((l) => [l.id, l.motivo]))

  return (
    <main className="lettura">
      <header className="intestazione-capitolo">
        <h1>{titolo}</h1>
        <p className="fonte">{fonte}</p>
      </header>

      <div className="testo">
        {versetti.map((versetto) => {
          const testo = traduzione?.testi[versetto.id]
          const lacuna = lacune.get(versetto.id)
          const contieneAttiva = parolaAttiva !== null && versettoDiParola(parolaAttiva) === versetto.id

          return (
            <article
              key={versetto.id}
              id={`v-${versetto.id}`}
              className={`versetto${contieneAttiva ? ' versetto--corrente' : ''}`}
              aria-labelledby={`n-${versetto.id}`}
            >
              <span className="numero" id={`n-${versetto.id}`}>
                {versetto.numero}
              </span>

              <p className="ebraico" lang="he" dir="rtl">
                {versetto.parole.map((id) => {
                  const parola = parolePerId.get(id)
                  if (!parola) return null
                  const classi = [
                    'parola',
                    id === parolaAttiva ? 'parola--attiva' : '',
                    id !== parolaAttiva && paroleDelLemma.has(id) ? 'parola--lemma' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <span key={id}>
                      <button
                        type="button"
                        className={classi}
                        lang="he"
                        aria-pressed={id === parolaAttiva}
                        onClick={() => onParola(id)}
                      >
                        {parola.testo}
                      </button>{' '}
                    </span>
                  )
                })}
              </p>

              {testo !== undefined ? (
                <p className="traduzione">{testo}</p>
              ) : (
                <p className="traduzione traduzione--assente">
                  {lacuna
                    ? `Nessun testo in questa traduzione: ${lacuna}`
                    : 'Nessun testo in questa traduzione per questo versetto.'}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </main>
  )
}
