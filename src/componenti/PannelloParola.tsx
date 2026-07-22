// src/componenti/PannelloParola.tsx — pannello della parola selezionata:
// parsing leggibile, glossa EN etichettata, occorrenze del lemma navigabili
// tramite indices/lemmi.json (ROADMAP F1.6b).

import { decodificaMorph } from '../lib/morfologia.ts'
import { etichettaVersetto, versettoDiParola } from '../lib/riferimenti.ts'
import type { Caricamento } from '../dati/hooks.ts'
import type { IndiceLemmi, LexiconIt, Morfema, Parola, VoceLexiconIt } from '../tipi/index.ts'

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
  lexicon: Caricamento<LexiconIt>
  onOccorrenza: (parolaId: string) => void
  onChiudi: () => void
}

export function PannelloParola({ parola, indice, lexicon, onOccorrenza, onChiudi }: Props) {
  return (
    <section className="pannello" aria-label="Parola selezionata">
      <div className="pannello-testa">
        <h2>Parola</h2>
        <button type="button" className="chiudi" aria-label="Chiudi il pannello parola" onClick={onChiudi}>
          Chiudi
        </button>
      </div>

      <div className="parola-testata">
        <span className="parola-grande" lang="he" dir="rtl">
          {parola.testo}
        </span>
        <GlossaGrande parola={parola} lexicon={lexicon} />
      </div>

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
            <Glosse morfema={morfema} lexicon={lexicon} />
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

/**
 * La glossa in testata: la parola tradotta sta accanto all'ebraico e con lo
 * stesso peso visivo, non come didascalia di servizio più in basso. La misura
 * latina è più piccola in cifre (--testo-lg contro --testo-ebraico-grande)
 * perché l'ebraico va al ~125-140% del latino affiancato per pareggiare
 * otticamente (DESIGN.md §2): a parità di px sembrerebbe l'italiano a gridare.
 *
 * Si glossano solo i morfemi lessicali: l'articolo di הַבְּהֵמָה o un suffisso
 * pronominale in testata direbbero «il» e «suo» accanto alla parola, cioè
 * rumore — il loro parsing resta per esteso nell'elenco dei morfemi sotto.
 * Quando di lessicale non c'è nulla (parola fatta di soli prefissi e suffissi)
 * la testata resta al solo ebraico: lo dice già la riga in fondo al pannello.
 */
function GlossaGrande({ parola, lexicon }: { parola: Parola; lexicon: Caricamento<LexiconIt> }) {
  const lessicali = parola.morfemi.filter(eLessicale)
  if (lessicali.length === 0) return null

  const voci = lessicali.map((m) => (lexicon.stato === 'pronto' ? lexicon.dati[m.strong] : undefined))
  // L'italiano si mostra solo se copre tutti i morfemi lessicali: una glossa
  // parziale, messa dove sta la parola tradotta, si leggerebbe come la resa
  // dell'intera parola.
  const completa = voci.every((v): v is VoceLexiconIt => v !== undefined)
  const daVerificare = completa && voci.some((v) => v.da_verificare)

  return (
    <p className="parola-glosse">
      {completa && (
        <span className={`parola-glossa-it${daVerificare ? ' da-verificare' : ''}`}>
          {voci.map((v) => v.glossa_it).join(' · ')}
          {daVerificare && <span className="solo-lettore-schermo"> (glossa da verificare)</span>}
        </span>
      )}
      <span className="parola-glossa-en" lang="en">
        {lessicali.map((m) => m.glossa_en).join(' · ')}
      </span>
    </p>
  )
}

/**
 * Le due glosse convivono sempre, ciascuna etichettata con la sua provenienza:
 * l'italiano è curato lemma per lemma (lexicon_it.json) e non deve mai sembrare
 * "la" glossa del dataset, né sostituire in silenzio quella TAHOT. Dove la voce
 * italiana manca — lemma non ancora curato, o file [C] non ancora in
 * public/data/ — resta la sola riga EN, senza segnalare nulla: è la condizione
 * normale, non un errore.
 */
function Glosse({ morfema, lexicon }: { morfema: Morfema; lexicon: Caricamento<LexiconIt> }) {
  const voce: VoceLexiconIt | undefined =
    lexicon.stato === 'pronto' ? lexicon.dati[morfema.strong] : undefined

  return (
    <>
      {voce && (
        <p className="glossa glossa-it">
          <span className="etichetta-inline">glossa IT</span>{' '}
          <span className={voce.da_verificare ? 'da-verificare' : undefined}>{voce.glossa_it}</span>
          {voce.da_verificare && <span className="solo-lettore-schermo"> (da verificare)</span>}
        </p>
      )}
      <p className="glossa">
        <span className="etichetta-inline">glossa EN</span> {morfema.glossa_en}
      </p>
    </>
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
