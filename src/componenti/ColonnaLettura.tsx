// src/componenti/ColonnaLettura.tsx — colonna centrale: ebraico word-level
// cliccabile e traduzione a fronte, versetto per versetto (ROADMAP F1.6b).
// Da F2.4 porta anche gli indicatori delle note nella fascia di margine.

import { SIGLA_TIPO_NOTA, ETICHETTA_TIPO_NOTA } from '../lib/note.ts'
import { ETICHETTA_CONFIDENZA } from '../lib/confidenza.ts'
import { versettoDiParola } from '../lib/riferimenti.ts'
import type { Nota, Parola, Traduzione, Versetto } from '../tipi/index.ts'

type Props = {
  titolo: string
  fonte: string
  versetti: Versetto[]
  parolePerId: Map<string, Parola>
  traduzione: Traduzione | null
  parolaAttiva: string | null
  /** Parole del capitolo che condividono un lemma con la parola attiva. */
  paroleDelLemma: ReadonlySet<string>
  /** Note da mostrare a margine, per id versetto (comprese quelle di parola e di pericope). */
  notePerVersetto: Map<string, Nota[]>
  /** Parole che portano almeno una nota: nel testo ebraico si marcano. */
  paroleAnnotate: ReadonlySet<string>
  /** Nota aperta nel pannello: il suo indicatore e la sua parola restano riconoscibili. */
  notaAperta: string | null
  onParola: (id: string) => void
  onNota: (versettoId: string, notaId: string) => void
}

export function ColonnaLettura({
  titolo,
  fonte,
  versetti,
  parolePerId,
  traduzione,
  parolaAttiva,
  paroleDelLemma,
  notePerVersetto,
  paroleAnnotate,
  notaAperta,
  onParola,
  onNota,
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
          const note = notePerVersetto.get(versetto.id) ?? []

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

              {note.length > 0 && (
                <ul className="margine-note" aria-label={`Note su ${versetto.numero}`}>
                  {note.map((nota) => (
                    <li key={nota.id}>
                      <IndicatoreNota
                        nota={nota}
                        aperta={nota.id === notaAperta}
                        onApri={() => onNota(versetto.id, nota.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <p className="ebraico" lang="he" dir="rtl">
                {versetto.parole.map((id) => {
                  const parola = parolePerId.get(id)
                  if (!parola) return null
                  const classi = [
                    'parola',
                    id === parolaAttiva ? 'parola--attiva' : '',
                    id !== parolaAttiva && paroleDelLemma.has(id) ? 'parola--lemma' : '',
                    paroleAnnotate.has(id) ? 'parola--annotata' : '',
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
                        {paroleAnnotate.has(id) && <span className="solo-lettore-schermo"> (parola annotata)</span>}
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

/**
 * L'indicatore a margine porta due informazioni in due canali distinti, come la
 * sigla di un apparato a stampa: la lettera dice il tipo di nota, il segno
 * geometrico accanto dice la confidenza (■ ▣ □ ◊ △, e ○ per l'attribuzione alla
 * tradizione). Il colore ripete la confidenza ma non la porta da solo: chi non
 * distingue i colori legge lettera e forma.
 */
function IndicatoreNota({ nota, aperta, onApri }: { nota: Nota; aperta: boolean; onApri: () => void }) {
  const descrizione = `Nota ${ETICHETTA_TIPO_NOTA[nota.tipo]}, confidenza ${ETICHETTA_CONFIDENZA[nota.confidence]}: ${nota.titolo}`

  return (
    <button
      type="button"
      className={`indicatore-nota indicatore-nota--${nota.confidence}${aperta ? ' indicatore-nota--aperta' : ''}`}
      aria-pressed={aperta}
      title={descrizione}
      onClick={onApri}
    >
      <span className="indicatore-sigla" aria-hidden="true">
        {SIGLA_TIPO_NOTA[nota.tipo]}
      </span>
      <span className={`segno-status segno-status--${nota.confidence}`} aria-hidden="true" />
      <span className="solo-lettore-schermo">{descrizione}</span>
    </button>
  )
}
