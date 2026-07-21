// src/componenti/PannelloParola.tsx — pannello della parola selezionata:
// parsing leggibile, glossa EN etichettata, occorrenze del lemma navigabili
// tramite indices/lemmi.json (ROADMAP F1.6b).

import { decodificaMorph } from '../lib/morfologia.ts'
import { etichettaVersetto, versettoDiParola } from '../lib/riferimenti.ts'
import type { Caricamento } from '../dati/hooks.ts'
import type { IndiceLemmi, Morfema, Parola } from '../tipi/index.ts'

// In TAHOT i codici H9xxx non sono lemmi del dizionario Strong ma marcatori di
// prefissi/suffissi (articolo H9009, waw H9002, preposizioni H9003…, suffissi
// pronominali H90xx). Le occorrenze devono puntare al morfema lessicale, non a
// questi: altrimenti הַשָּׁמַיִם mostrerebbe le 7436 occorrenze dell'articolo.
function eLessicale(morfema: Morfema): boolean {
  return !/^H9\d{3}/.test(morfema.strong)
}

type Props = {
  parola: Parola
  indice: Caricamento<IndiceLemmi>
  onOccorrenza: (parolaId: string) => void
  onChiudi: () => void
}

export function PannelloParola({ parola, indice, onOccorrenza, onChiudi }: Props) {
  return (
    <section className="pannello" aria-label="Parola selezionata">
      <div className="pannello-testa">
        <h2>Parola</h2>
        <button type="button" className="chiudi" aria-label="Chiudi il pannello parola" onClick={onChiudi}>
          Chiudi
        </button>
      </div>

      <span className="parola-grande" lang="he" dir="rtl">
        {parola.testo}
      </span>

      <p className="parsing">
        <span className="translit">{parola.translit}</span>
        <br />
        {decodificaMorph(parola.morph)}
        <br />
        <span className="codice">
          <span className="etichetta-inline">codice TAHOT</span> {parola.morph}
        </span>
        {(parola.ketiv || parola.qere) && (
          <>
            <br />
            <span className="etichetta-inline">ketiv/qere</span>{' '}
            <bdi lang="he" dir="rtl">
              {parola.ketiv ?? '—'} / {parola.qere ?? '—'}
            </bdi>
          </>
        )}
      </p>

      <ul className="morfemi">
        {parola.morfemi.map((morfema, i) => (
          <li key={`${morfema.strong}-${i}`}>
            <div className="morfema-testa">
              <span className="lemma" lang="he" dir="rtl">
                <bdi>{morfema.lemma}</bdi>
              </span>
              <span className="strong">{morfema.strong}</span>
            </div>
            <p className="glossa">
              <span className="etichetta-inline">glossa EN</span> {morfema.glossa_en}
            </p>
            {eLessicale(morfema) ? (
              <Occorrenze
                strong={morfema.strong}
                parolaCorrente={parola.id}
                indice={indice}
                onOccorrenza={onOccorrenza}
              />
            ) : (
              <p className="conteggio">Prefisso/suffisso: nessun conteggio di occorrenze.</p>
            )}
          </li>
        ))}
      </ul>
      {!parola.morfemi.some(eLessicale) && (
        <p className="conteggio">
          Parola formata solo da prefissi/suffissi: nessun morfema lessicale a cui riferire le occorrenze.
        </p>
      )}
    </section>
  )
}

type PropsOccorrenze = {
  strong: string
  parolaCorrente: string
  indice: Caricamento<IndiceLemmi>
  onOccorrenza: (parolaId: string) => void
}

function Occorrenze({ strong, parolaCorrente, indice, onOccorrenza }: PropsOccorrenze) {
  if (indice.stato === 'in_corso') return <p className="conteggio">Caricamento dell'indice dei lemmi…</p>
  if (indice.stato === 'errore')
    return (
      <p className="stato-errore" role="alert">
        Indice dei lemmi non caricato: {indice.messaggio}
      </p>
    )

  const voce = indice.dati.lemmi[strong]
  if (!voce) return <p className="conteggio">Nessuna voce di lemma per {strong}.</p>

  return (
    <>
      <p className="conteggio">
        {voce.occorrenze.length} occorrenze nel Pentateuco
        {voce.occorrenze.length > 200 ? ' — mostrate le prime 200' : ''}
      </p>
      <ul className="occorrenze">
        {voce.occorrenze.slice(0, 200).map((id) => (
          <li key={id}>
            <button
              type="button"
              aria-current={id === parolaCorrente}
              onClick={() => onOccorrenza(id)}
            >
              {etichettaVersetto(versettoDiParola(id))}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
