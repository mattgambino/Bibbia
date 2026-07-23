// src/viste/Genealogie.tsx — vista genealogie a schermo pieno (ROADMAP F3.3).
//
// Tre scelte che reggono il file, le stesse di mappa e timeline:
// 1. L'albero non è la fonte: lo è l'apparato a sinistra. Ogni figura selezionata
//    vi porta nome, età letterali, parentele, riferimenti e note critiche; e vi
//    sta anche ciò che l'albero non può dire da solo — perché una genealogia si
//    presenti in tronchi separati (un legame padre-figlio assente dai dati).
// 2. Il confine di ogni albero è il capitolo curato (Gen 5, 10, 11): le figure
//    sono quelle che le pericopi nominano, non "tutti i discendenti".
// 3. Le età sono quelle letterali del testo, dato narrativo: la cronologia
//    cumulativa in Anno Mundi sta nella timeline, con le sue avvertenze.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlberoGenealogico } from '../componenti/AlberoGenealogico.tsx'
import { ElencoFonti, SegnoDaVerificare } from '../componenti/Elementi.tsx'
import { VoceNota } from '../componenti/PannelloNote.tsx'
import {
  GENEALOGIE,
  costruisciAlbero,
  genealogiaDiPersona,
  nomePersona,
  notePerFigura,
  noteGenealogia,
} from '../lib/genealogia.ts'
import type { Albero, GenealogiaId } from '../lib/genealogia.ts'
import { etichettaVersetto } from '../lib/riferimenti.ts'
import { useEventi, useNote, usePersone } from '../dati/hooks.ts'
import type { Nota, Persona } from '../tipi/index.ts'

type Props = {
  /** Figura da aprire all'arrivo: si entra dalla scheda di una persona nel tab «Chi». */
  personaIniziale?: string | null
  onLettura: () => void
  /** Ritorno al testo su un versetto preciso: è l'uscita dalle genealogie. */
  onVersetto: (versetto: string) => void
}

export function Genealogie({ personaIniziale, onLettura, onVersetto }: Props) {
  const eventi = useEventi()
  const persone = usePersone()
  const note = useNote()
  const [id, setId] = useState<GenealogiaId>('gen5')
  const [scelta, setScelta] = useState<string | null>(null)

  // Si arriva da una pagina scorsa a metà: la vista occupa lo schermo e non
  // scorre, quindi senza questo la testata resterebbe sopra il bordo superiore.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const datiPronti = eventi.stato === 'pronto' && persone.stato === 'pronto'
  const listaEventi = eventi.stato === 'pronto' ? eventi.dati : []
  const listaPersone = persone.stato === 'pronto' ? persone.dati : []
  const listaNote = note.stato === 'pronto' ? note.dati : []

  const alberi = useMemo(() => {
    if (!datiPronti) return new Map<GenealogiaId, Albero>()
    return new Map(GENEALOGIE.map((def) => [def.id, costruisciAlbero(def, listaEventi, listaPersone)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datiPronti, eventi, persone])

  const personePerId = useMemo(() => new Map(listaPersone.map((p) => [p.id, p])), [persone])

  // Arrivando dal tab «Chi» si apre l'albero che contiene la figura, già scelta.
  const iniziale = useRef(personaIniziale ?? null)
  useEffect(() => {
    const pid = iniziale.current
    if (!pid || !datiPronti) return
    iniziale.current = null
    const dove = genealogiaDiPersona(pid, listaEventi, listaPersone)
    if (dove) {
      setId(dove)
      setScelta(pid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datiPronti])

  const albero = alberi.get(id) ?? null
  const noteFigure = useMemo(() => (albero ? notePerFigura(listaNote, albero) : new Map()), [albero, note])
  const noteAlbero = useMemo(() => (albero ? noteGenealogia(listaNote, albero.def.capitolo) : []), [albero, note])

  // Gli id delle figure dell'albero corrente: serve a sapere quali parenti sono
  // raggiungibili qui dentro e quali stanno altrove.
  const idNelAlbero = useMemo(() => {
    const insieme = new Set<string>()
    const percorri = (n: { persona: Persona; figli: any[] }) => {
      insieme.add(n.persona.id)
      n.figli.forEach(percorri)
    }
    albero?.radici.forEach(percorri)
    return insieme
  }, [albero])

  const personaScelta = scelta ? (personePerId.get(scelta) ?? null) : null

  // Cambiando albero, una scelta che non vi appartiene si lascia cadere.
  useEffect(() => {
    if (scelta && !idNelAlbero.has(scelta)) setScelta(null)
  }, [idNelAlbero, scelta])

  // La figura scelta si porta in vista sull'albero: la si sceglie anche dalle
  // parentele nell'apparato, e in un albero alto non si vedrebbe cambiare nulla.
  const contenitore = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!scelta) return
    contenitore.current
      ?.querySelector<HTMLElement>(`[data-figura="${CSS.escape(scelta)}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [scelta, id])

  const inCorso = eventi.stato === 'in_corso' || persone.stato === 'in_corso'
  const errore =
    eventi.stato === 'errore' ? eventi.messaggio : persone.stato === 'errore' ? persone.messaggio : null

  return (
    <div className="genealogie-vista">
      <header className="vista-testa">
        <div>
          <p className="marchio">Pentateuco in contesto</p>
          <h1>Persone</h1>
        </div>
        <button type="button" className="bottone-ritorno" onClick={onLettura}>
          Torna alla lettura
        </button>
      </header>

      <aside className="vista-apparato" aria-label="Genealogie e apparato delle figure">
        {errore ? (
          <p className="stato-errore" role="alert">
            Curation non caricata: {errore}
          </p>
        ) : inCorso ? (
          <p className="stato-caricamento">Caricamento delle persone…</p>
        ) : !albero || albero.totale === 0 ? (
          <p className="vuoto">
            Nessuna genealogia da mostrare: events.json e people.json non sono ancora in public/data/.
          </p>
        ) : (
          <>
            <fieldset className="filtro">
              <legend>Albero</legend>
              {GENEALOGIE.map((def) => {
                const a = alberi.get(def.id)
                return (
                  <label key={def.id} className="filtro-voce filtro-voce--radio">
                    <input
                      type="radio"
                      name="genealogia"
                      checked={id === def.id}
                      onChange={() => setId(def.id)}
                    />
                    <span className="filtro-etichetta">{def.titolo}</span>
                    <span className="conteggio">{a ? a.totale : 0}</span>
                  </label>
                )
              })}
            </fieldset>

            <p className="vista-conto" aria-live="polite">
              {albero.def.sottotitolo} · {albero.totale === 1 ? '1 figura' : `${albero.totale} figure`}
            </p>

            {albero.radici.length > 1 && (
              <p className="genealogie-tronchi">
                Questa genealogia compare in {albero.radici.length} tronchi separati:{' '}
                {albero.radici.length} figure non hanno, fra quelle curate del capitolo, un genitore a
                cui agganciarsi. È un dato sullo stato dei collegamenti importati, non una lettura del
                testo.
              </p>
            )}

            {noteAlbero.length > 0 && (
              <section className="genealogie-note-albero">
                <p className="etichetta">Note sulla genealogia</p>
                <ul className="note">
                  {noteAlbero.map((n) => (
                    <VoceNota key={n.id} nota={n} />
                  ))}
                </ul>
              </section>
            )}

            {personaScelta ? (
              <SchedaFigura
                persona={personaScelta}
                note={noteFigure.get(personaScelta.id) ?? []}
                nome={(pid) => {
                  const p = personePerId.get(pid)
                  return p ? nomePersona(p) : pid
                }}
                nelAlbero={idNelAlbero}
                onFigura={setScelta}
                onVersetto={onVersetto}
              />
            ) : (
              <p className="vista-nota">
                Scegli una figura nell'albero per vederne l'età letterale, le parentele, i riferimenti
                nel testo e le note critiche. Le età sono quelle del racconto, dato narrativo: la
                cronologia in Anno Mundi sta nella timeline.
              </p>
            )}
          </>
        )}
      </aside>

      <main className="genealogie-tela" ref={contenitore}>
        {albero && albero.totale > 0 && (
          <AlberoGenealogico
            albero={albero}
            selezione={scelta}
            notePerFigura={noteFigure}
            onSeleziona={(pid) => setScelta((prec) => (prec === pid ? null : pid))}
          />
        )}
      </main>
    </div>
  )
}

/* ---------------------------------------------------------------- scheda --- */

/**
 * La scheda della figura scelta: nome, età letterali come dato narrativo,
 * parentele (i parenti presenti in quest'albero si aprono con un click),
 * riferimenti al testo, note critiche agganciate.
 */
function SchedaFigura({
  persona,
  note,
  nome,
  nelAlbero,
  onFigura,
  onVersetto,
}: {
  persona: Persona
  note: Nota[]
  nome: (id: string) => string
  nelAlbero: Set<string>
  onFigura: (id: string) => void
  onVersetto: (versetto: string) => void
}) {
  const d = persona.dati_narrativi
  const parentele: [string, string[]][] = [
    ['padre', persona.relazioni.padre ? [persona.relazioni.padre] : []],
    ['madre', persona.relazioni.madre ? [persona.relazioni.madre] : []],
    ['coniugi', persona.relazioni.coniugi],
    ['figli', persona.relazioni.figli],
  ]

  return (
    <section className="scheda scheda-figura" aria-live="polite">
      <p className="scheda-testa">
        <span className="scheda-nome">{nomePersona(persona)}</span>
        {persona.nomi.he && (
          <>
            {' '}
            <bdi className="lemma" lang="he" dir="rtl">
              {persona.nomi.he}
            </bdi>
          </>
        )}
      </p>
      {persona.nomi.it && persona.nomi.translit && <p className="translit">{persona.nomi.translit}</p>}

      {d && (d.eta_al_primo_figlio != null || d.eta_totale != null) && (
        <p className="figura-eta">
          {d.eta_al_primo_figlio != null && <>Generò a {d.eta_al_primo_figlio} anni. </>}
          {d.eta_totale != null && <>Visse {d.eta_totale} anni.</>}
          <span className="figura-eta-nota"> Cifra del racconto (TM), dato narrativo.</span>
        </p>
      )}

      <dl className="parentele">
        {parentele
          .filter(([, v]) => v.length > 0)
          .map(([etichetta, ids]) => (
            <div key={etichetta}>
              <dt>{etichetta}</dt>
              <dd>
                {ids.map((pid, i) => (
                  <span key={pid}>
                    {i > 0 && ', '}
                    {nelAlbero.has(pid) ? (
                      <button type="button" className="rimando-note" onClick={() => onFigura(pid)}>
                        {nome(pid)}
                      </button>
                    ) : (
                      nome(pid)
                    )}
                  </span>
                ))}
              </dd>
            </div>
          ))}
      </dl>

      <p className="scheda-riferimenti">
        {persona.riferimenti.map((r) => (
          <button key={r} type="button" className="rimando-versetto" onClick={() => onVersetto(r)}>
            {etichettaVersetto(r)}
          </button>
        ))}
      </p>

      <section className="genealogie-note-figura">
        <p className="etichetta">Note critiche</p>
        {note.length === 0 ? (
          <p className="vuoto">Nessuna nota curata su questa figura.</p>
        ) : (
          <ul className="note">
            {note.map((n) => (
              <VoceNota key={n.id} nota={n} />
            ))}
          </ul>
        )}
      </section>

      {persona.fonti.length > 0 && (
        <>
          <p className="etichetta">Fonti della figura</p>
          <ElencoFonti fonti={persona.fonti} dettagli />
        </>
      )}
      {persona.da_verificare && <SegnoDaVerificare />}
    </section>
  )
}
