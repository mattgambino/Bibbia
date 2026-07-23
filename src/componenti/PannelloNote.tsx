// src/componenti/PannelloNote.tsx — lettura delle note curate (ROADMAP F2.4).
//
// Il pannello si apre solo su scelta esplicita (un indicatore a margine, o il
// rimando dentro la scheda di un luogo/persona): le note sono apparato, non
// commento continuo, e non devono comparire da sole accanto al testo.
//
// Ogni nota mostra sempre, nell'ordine: prospettiva, tipo, badge di confidenza,
// titolo, ancoraggio, testo, commentatore e link Sefaria dove esistono, fonti,
// flag `da_verificare` (specifica §8). Nessuno di questi campi è nascosto dietro
// un "mostra altro": è l'apparato che giustifica la nota.

import { useEffect, useRef } from 'react'
import { BadgeConfidenza, ElencoFonti, SegnoDaVerificare } from './Elementi.tsx'
import {
  ETICHETTA_PROSPETTIVA,
  ETICHETTA_TIPO_NOTA,
  SIGLA_TIPO_NOTA,
  etichettaAncoraggio,
  prospettivaDi,
  urlSefaria,
} from '../lib/note.ts'
import type { Nota, Parola } from '../tipi/index.ts'

type Props = {
  /** Che cosa si sta annotando: "Genesi 1,1", il nome di un luogo o di una persona. */
  ancoraggio: string
  note: Nota[]
  /** Nota da cui si è arrivati: riceve il fuoco visivo, le altre dello stesso ancoraggio restano leggibili. */
  idEvidenziata: string | null
  /** Parola ebraica a cui una nota è ancorata, quando l'ancoraggio è una parola. */
  parolaDi: (notaId: string) => Parola | null
  /** Vero quando l'apertura delle note è l'ultima azione del lettore: solo allora il pannello si porta in vista. */
  portaInVista: boolean
  onChiudi: () => void
}

export function PannelloNote({ ancoraggio, note, idEvidenziata, parolaDi, portaInVista, onChiudi }: Props) {
  // La colonna dell'apparato scorre per conto suo: se è già scesa sul contesto,
  // il pannello si apre fuori campo e il click sull'indicatore sembra non aver
  // fatto nulla. Si riporta in vista a ogni apertura, senza animazione.
  // Si porta in vista la nota scelta, non la testa del pannello: su un versetto
  // con quattro note, la terza è quella che il lettore ha chiesto.
  const pannello = useRef<HTMLElement>(null)
  const evidenziata = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!portaInVista) return
    const bersaglio = evidenziata.current ?? pannello.current
    bersaglio?.scrollIntoView({ block: 'nearest' })
  }, [ancoraggio, idEvidenziata, portaInVista])

  return (
    <section className="pannello pannello-note" aria-label="Note critiche" ref={pannello}>
      <div className="pannello-testa">
        <h2>Note</h2>
        <button type="button" className="chiudi" aria-label="Chiudi il pannello delle note" onClick={onChiudi}>
          Chiudi
        </button>
      </div>

      <p className="note-ancoraggio">{ancoraggio}</p>

      {note.length === 0 ? (
        <p className="vuoto">Nessuna nota curata su questo passo.</p>
      ) : (
        <ul className="note">
          {note.map((nota) => (
            <VoceNota
              key={nota.id}
              nota={nota}
              evidenziata={nota.id === idEvidenziata}
              parola={parolaDi(nota.id)}
              riferimento={nota.id === idEvidenziata ? evidenziata : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Una nota con tutto il suo apparato. Esportata perché la voce di una nota si
 * scrive in un posto solo: oltre al pannello della lettura, la usa il popup
 * della vista mappa (F3.1). Va sempre dentro un `<ul className="note">`.
 */
export function VoceNota({
  nota,
  evidenziata = false,
  parola = null,
  riferimento,
}: {
  nota: Nota
  evidenziata?: boolean
  parola?: Parola | null
  riferimento?: React.RefObject<HTMLLIElement | null>
}) {
  const prospettiva = prospettivaDi(nota)

  return (
    <li
      ref={riferimento}
      className={`nota nota--${prospettiva}${evidenziata ? ' nota--evidenziata' : ''}`}
      aria-current={evidenziata ? 'true' : undefined}
    >
      <p className="nota-prospettiva">{ETICHETTA_PROSPETTIVA[prospettiva]}</p>

      <p className="nota-testa">
        <span className={`sigla sigla--${prospettiva}`} aria-hidden="true">
          {SIGLA_TIPO_NOTA[nota.tipo]}
        </span>{' '}
        {/* Per le note della tradizione il tipo direbbe due volte la stessa cosa
            dell'etichetta di prospettiva: si scrive una volta sola. */}
        {prospettiva === 'critica' && <span className="nota-tipo">{ETICHETTA_TIPO_NOTA[nota.tipo]}</span>}{' '}
        <BadgeConfidenza status={nota.confidence} />
      </p>

      <h3 className="nota-titolo">{nota.titolo}</h3>

      {/* Per luogo e persona l'ancoraggio è già nella testa del pannello, e qui
          uscirebbe come slug nudo: si scrive dove il riferimento è al testo. */}
      {nota.target.tipo !== 'luogo' && nota.target.tipo !== 'persona' && (
        <p className="nota-ancora">
          {etichettaAncoraggio(nota)}
          {parola && (
            <>
              {' · '}
              <bdi className="lemma" lang="he" dir="rtl">
                {parola.testo}
              </bdi>{' '}
              <span className="translit">{parola.translit}</span>
            </>
          )}
        </p>
      )}

      <p className="nota-testo">{nota.testo}</p>

      {nota.commentatore && (
        <p className="nota-commentatore">
          {nota.commentatore}
          {nota.sefaria_ref && (
            <>
              {' — '}
              <a href={urlSefaria(nota.sefaria_ref)} target="_blank" rel="noreferrer noopener">
                {nota.sefaria_ref} su Sefaria
              </a>
            </>
          )}
        </p>
      )}

      <ElencoFonti fonti={nota.fonti} dettagli />
      {nota.da_verificare && <SegnoDaVerificare />}
    </li>
  )
}
