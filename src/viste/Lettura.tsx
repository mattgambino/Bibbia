// src/viste/Lettura.tsx — vista lettura (ROADMAP F1.6b).
//
// Tiene insieme le tre colonne e lo stato di lettura: posizione, traduzione a
// fronte (entrambe persistite in localStorage) e parola selezionata. I dati
// arrivano dagli hook di dati/hooks.ts, un file per libro.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ColonnaContesto } from '../componenti/ColonnaContesto.tsx'
import { ColonnaLettura } from '../componenti/ColonnaLettura.tsx'
import { ColonnaNavigazione } from '../componenti/ColonnaNavigazione.tsx'
import { PannelloNote } from '../componenti/PannelloNote.tsx'
import { PannelloParola } from '../componenti/PannelloParola.tsx'
import {
  useEventi,
  useIndiceLemmi,
  useLexiconIt,
  useLuoghi,
  useManifestTraduzioni,
  useNote,
  useParole,
  usePersone,
  useTraduzione,
  useVersetti,
} from '../dati/hooks.ts'
import { indicizzaNote } from '../lib/note.ts'
import { pericopeDi } from '../lib/pericopi.ts'
import { etichettaVersetto, leggiVersettoId, nomeLibro, versettoDiParola } from '../lib/riferimenti.ts'
import { usaPosizione, usaTraduzione } from '../stato/preferenze.ts'
import type { Nota, Parola, Versetto } from '../tipi/index.ts'

/** Che cosa mostra il pannello note: da dove si è arrivati, le note di quell'ancoraggio, quale evidenziare. */
type SelezioneNote = { ancoraggio: string; note: Nota[]; idEvidenziata: string | null }

/**
 * Il versetto "in lettura": il primo che intercetta la fascia alta della
 * finestra. Serve solo a sincronizzare la colonna contesto, quindi basta un
 * IntersectionObserver — nessun listener di scroll, nessun calcolo a ogni frame.
 * Il margine inferiore negativo esclude la metà bassa dello schermo: senza,
 * "visibile" comprenderebbe versetti che il lettore non ha ancora raggiunto.
 */
function usaVersettoInLettura(versetti: Versetto[]): string | null {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    if (versetti.length === 0) {
      setId(null)
      return
    }
    setId(versetti[0].id)

    const visibili = new Set<string>()
    const osservatore = new IntersectionObserver(
      (voci) => {
        for (const voce of voci) {
          const idVersetto = voce.target.id.replace(/^v-/, '')
          if (voce.isIntersecting) visibili.add(idVersetto)
          else visibili.delete(idVersetto)
        }
        const primo = versetti.find((v) => visibili.has(v.id))
        if (primo) setId(primo.id)
      },
      { rootMargin: '0px 0px -55% 0px' },
    )
    for (const v of versetti) {
      const elemento = document.getElementById(`v-${v.id}`)
      if (elemento) osservatore.observe(elemento)
    }
    return () => osservatore.disconnect()
  }, [versetti])

  return id
}

export function Lettura() {
  const [posizione, setPosizione] = usaPosizione()
  const [idTraduzione, setIdTraduzione] = usaTraduzione()
  const [parolaAttiva, setParolaAttiva] = useState<string | null>(null)
  const [noteSelezionate, setNoteSelezionate] = useState<SelezioneNote | null>(null)
  // Su desktop l'apparato è sempre in colonna; l'interruttore serve solo sotto
  // 1100px, dove la colonna diventa un pannello sovrapposto.
  const [contestoAperto, setContestoAperto] = useState(true)

  const versetti = useVersetti(posizione.libro)
  const parole = useParole(posizione.libro)
  const manifest = useManifestTraduzioni()
  const traduzione = useTraduzione(idTraduzione)
  // L'indice dei lemmi (~2 MB) si scarica solo alla prima parola aperta.
  const indiceLemmi = useIndiceLemmi(parolaAttiva !== null)
  const lexiconIt = useLexiconIt(parolaAttiva !== null)
  // I file di curation valgono per tutto il Pentateuco e servono alla colonna
  // contesto fin dal primo scroll: si caricano con la vista.
  const eventi = useEventi()
  const luoghi = useLuoghi()
  const persone = usePersone()
  const note = useNote()

  // Le note si riducono una volta sola a "che cosa compare a margine di quale
  // versetto"; i cinque target restano leggibili nel pannello (lib/note.ts).
  const indiceNote = useMemo(() => indicizzaNote(note.stato === 'pronto' ? note.dati : []), [note])

  const parolePerId = useMemo<Map<string, Parola>>(() => {
    if (parole.stato !== 'pronto') return new Map()
    return new Map(parole.dati.parole.map((p) => [p.id, p]))
  }, [parole])

  const versettiCapitolo = useMemo(() => {
    if (versetti.stato !== 'pronto') return []
    return versetti.dati.versetti.filter((v) => v.capitolo === posizione.capitolo)
  }, [versetti, posizione.capitolo])

  const parola = parolaAttiva ? (parolePerId.get(parolaAttiva) ?? null) : null

  const versettoInLettura = usaVersettoInLettura(versettiCapitolo)
  const pericope = useMemo(() => {
    if (eventi.stato !== 'pronto' || !versettoInLettura) return null
    return pericopeDi(eventi.dati, versettoInLettura)
  }, [eventi, versettoInLettura])

  // Altre occorrenze del lemma dentro il capitolo aperto: si evidenziano nel
  // testo, mentre l'elenco completo (tutto il Pentateuco) sta nel pannello.
  const paroleDelLemma = useMemo(() => {
    const insieme = new Set<string>()
    if (!parola) return insieme
    const strong = new Set(parola.morfemi.map((m) => m.strong))
    for (const v of versettiCapitolo) {
      for (const id of v.parole) {
        const altra = parolePerId.get(id)
        if (altra && altra.morfemi.some((m) => strong.has(m.strong))) insieme.add(id)
      }
    }
    return insieme
  }, [parola, versettiCapitolo, parolePerId])

  // Le parole con almeno una nota si marcano nel testo: gli id di parola sono
  // unici su tutto il Pentateuco, quindi l'insieme vale per qualunque capitolo.
  const paroleAnnotate = useMemo(() => new Set(indiceNote.perParola.keys()), [indiceNote])

  // Aperture del pannello note: dall'indicatore a margine (tutte le note di quel
  // versetto, evidenziata quella scelta), dalla parola annotata (le sue note),
  // dalla scheda di un luogo o di una persona (colonna contesto).
  const apriNoteVersetto = (versettoId: string, notaId: string) => {
    setNoteSelezionate({
      ancoraggio: etichettaVersetto(versettoId),
      note: indiceNote.perVersetto.get(versettoId) ?? [],
      idEvidenziata: notaId,
    })
    setContestoAperto(true)
  }

  const apriNoteEntita = (ancoraggio: string, elenco: Nota[], idEvidenziata: string | null) => {
    setNoteSelezionate({ ancoraggio, note: elenco, idEvidenziata })
    setContestoAperto(true)
  }

  // La parola selezionata apre sempre il pannello parola; se porta note, apre
  // anche quelle. Il segno tratteggiato sotto la parola annunciava un apparato:
  // sarebbe un tratto senza conseguenze se il click non lo aprisse.
  const apriParola = (id: string) => {
    setParolaAttiva(id)
    setContestoAperto(true)
    const noteParola = indiceNote.perParola.get(id)
    if (noteParola && noteParola.length > 0) {
      setNoteSelezionate({
        ancoraggio: etichettaVersetto(versettoDiParola(id)),
        note: noteParola,
        idEvidenziata: noteParola[0].id,
      })
    }
  }

  /** La parola ebraica a cui una nota è ancorata, quando il target è `parola`. */
  const parolaDiNota = (notaId: string): Parola | null => {
    const nota = noteSelezionate?.note.find((n) => n.id === notaId)
    if (!nota || nota.target.tipo !== 'parola') return null
    return parolePerId.get(nota.target.ref) ?? null
  }

  // Se la traduzione salvata non è più installata si ricade sulla prima
  // disponibile, invece di lasciare la colonna centrale senza testo a fronte.
  useEffect(() => {
    if (manifest.stato !== 'pronto') return
    if (!manifest.dati.disponibili.includes(idTraduzione) && manifest.dati.disponibili.length > 0) {
      setIdTraduzione(manifest.dati.disponibili[0])
    }
  }, [manifest, idTraduzione, setIdTraduzione])

  // Navigazione per occorrenza: la parola scelta può stare in un altro libro o
  // capitolo, quindi si sposta la posizione e poi si porta il versetto in vista.
  const daPortareInVista = useRef<string | null>(null)
  const vaiAParola = (id: string) => {
    const rif = leggiVersettoId(versettoDiParola(id))
    if (!rif) return
    if (rif.libro !== posizione.libro || rif.capitolo !== posizione.capitolo) {
      setPosizione({ libro: rif.libro, capitolo: rif.capitolo })
    }
    apriParola(id)
    daPortareInVista.current = versettoDiParola(id)
  }

  useEffect(() => {
    const idVersetto = daPortareInVista.current
    if (!idVersetto || versettiCapitolo.length === 0) return
    const elemento = document.getElementById(`v-${idVersetto}`)
    if (!elemento) return
    elemento.scrollIntoView({ block: 'center', behavior: 'smooth' })
    daPortareInVista.current = null
  }, [versettiCapitolo])

  const traduzioni = useMemo(() => {
    const ids = manifest.stato === 'pronto' ? manifest.dati.disponibili : [idTraduzione]
    // Il manifest elenca solo gli id; il nome esteso sta nel meta del file della
    // traduzione, quindi lo si mostra per quella caricata e non per le altre.
    return ids.map((id) => ({
      id,
      nome: id === idTraduzione && traduzione.stato === 'pronto' ? traduzione.dati.meta.nome : id,
    }))
  }, [manifest, traduzione, idTraduzione])

  const titolo = `${nomeLibro(posizione.libro)} ${posizione.capitolo}`
  const fonte =
    traduzione.stato === 'pronto'
      ? `Testo masoretico (TAHOT) · traduzione: ${traduzione.dati.meta.nome} (${traduzione.dati.meta.anno ?? 's.d.'})`
      : 'Testo masoretico (TAHOT)'

  const inCorso = versetti.stato === 'in_corso' || parole.stato === 'in_corso'
  const errore =
    versetti.stato === 'errore'
      ? versetti.messaggio
      : parole.stato === 'errore'
        ? parole.messaggio
        : traduzione.stato === 'errore'
          ? traduzione.messaggio
          : null

  return (
    <div className="app">
      <ColonnaNavigazione
        posizione={posizione}
        onPosizione={(p) => {
          setPosizione(p)
          setParolaAttiva(null)
          setNoteSelezionate(null)
        }}
        traduzioni={traduzioni}
        traduzione={idTraduzione}
        onTraduzione={setIdTraduzione}
      />

      {errore ? (
        <main className="lettura">
          <p className="stato-errore" role="alert">
            Errore di caricamento: {errore}
          </p>
        </main>
      ) : inCorso ? (
        <main className="lettura">
          <p className="stato-caricamento">Caricamento del testo…</p>
        </main>
      ) : (
        <ColonnaLettura
          titolo={titolo}
          fonte={fonte}
          versetti={versettiCapitolo}
          parolePerId={parolePerId}
          traduzione={traduzione.stato === 'pronto' ? traduzione.dati : null}
          parolaAttiva={parolaAttiva}
          paroleDelLemma={paroleDelLemma}
          notePerVersetto={indiceNote.perVersetto}
          paroleAnnotate={paroleAnnotate}
          notaAperta={noteSelezionate?.idEvidenziata ?? null}
          onParola={apriParola}
          onNota={apriNoteVersetto}
        />
      )}

      <aside className="contesto" aria-label="Apparato" hidden={!contestoAperto}>
        {noteSelezionate && (
          <PannelloNote
            ancoraggio={noteSelezionate.ancoraggio}
            note={noteSelezionate.note}
            idEvidenziata={noteSelezionate.idEvidenziata}
            parolaDi={parolaDiNota}
            onChiudi={() => setNoteSelezionate(null)}
          />
        )}

        {parola ? (
          <PannelloParola
            parola={parola}
            indice={indiceLemmi}
            lexicon={lexiconIt}
            onOccorrenza={vaiAParola}
            onChiudi={() => setParolaAttiva(null)}
          />
        ) : (
          <section className="pannello">
            <h2>Parola</h2>
            <p className="vuoto">Scegli una parola del testo ebraico per vederne parsing e occorrenze.</p>
          </section>
        )}

        <ColonnaContesto
          pericope={pericope}
          eventi={eventi}
          luoghi={luoghi}
          persone={persone}
          notePerLuogo={indiceNote.perLuogo}
          notePerPersona={indiceNote.perPersona}
          onNote={apriNoteEntita}
        />
      </aside>

      <button
        type="button"
        className="contesto-interruttore"
        aria-expanded={contestoAperto}
        onClick={() => setContestoAperto((v) => !v)}
      >
        {contestoAperto ? 'Chiudi apparato' : 'Apri apparato'}
      </button>
    </div>
  )
}
