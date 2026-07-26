// test/rag.test.ts — regressione permanente del guardrail RAG (ROADMAP F4.3, specifica §9).
//
// `analizzaRisposta` è il punto in cui i non-negoziabili #1 (mai testo biblico fuori
// dal database) e #3 (mai dati non approvati) smettono di essere una regola scritta e
// diventano codice eseguito: una regressione lì — un `!` invertito, una modifica alla
// regex dei riferimenti — passerebbe `valida`, `tsc -b` e `vite build` tutti verdi.
// Questi test la fermano.
//
// Regola 1 di CLAUDE.md, rispettata anche qui: **nessun testo biblico o di traduzione
// è scritto in questo file**. La risposta di prova è fatta di soli riferimenti, e ogni
// testo atteso viene letto dal database. Anche gli id dei casi non sono hardcodati:
// si scelgono dal dataset in base alla proprietà che serve al caso, così il test resta
// valido quando il corpus curato si allarga.

import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { analizzaRisposta, type Fonte, type SegmentoRif } from '../src/lib/rag.ts'
import { etichettaVersetto } from '../src/lib/riferimenti.ts'

const leggi = (rel: string): unknown =>
  JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'))

const letterale = leggi('public/data/translations/letterale.json') as { testi: Record<string, string> }
const note = leggi('public/data/notes.json') as { id: string; titolo: string; testo: string }[]
const gen = leggi('public/data/verses/gen.json') as { versetti: { id: string }[] }

const testoVersetto = (ref: string): string | undefined => letterale.testi[ref]
const mappaNote = new Map(note.map((n) => [n.id, { titolo: n.titolo, testo: n.testo }]))
const nota = (id: string) => mappaNote.get(id)
const idEsistenti = new Set(gen.versetti.map((v) => v.id))
const versettoEsiste = (id: string) => idEsistenti.has(id)

// --- scelta dei casi dal dataset, non da costanti scritte a mano ------------------

const curati = Object.keys(letterale.testi)
/** Versetto curato che finirà nel contesto recuperato. */
const ID_IN_CONTESTO = curati[0]
/** Versetto curato ma NON recuperato: deve risultare fuori-contesto. */
const ID_CURATO_FUORI = curati[curati.length - 1]
/** Versetto reale del dataset ma privo di testo curato (fuori dal corpus della letterale). */
const ID_NON_CURATO = gen.versetti.map((v) => v.id).find((id) => !(id in letterale.testi))
/** Riferimento inventato: nessun capitolo 99 esiste in Genesi. */
const ETICHETTA_INESISTENTE = 'Genesi 99,99'

const ID_NOTA_IN_CONTESTO = note[0].id
const ID_NOTA_FUORI = note[note.length - 1].id

test('il dataset offre tutti i casi che il guardrail deve distinguere', () => {
  assert.ok(curati.length >= 2, 'servono almeno due versetti curati distinti')
  assert.notEqual(ID_IN_CONTESTO, ID_CURATO_FUORI)
  assert.ok(ID_NON_CURATO, 'serve un versetto del dataset senza testo curato')
  assert.ok(note.length >= 2, 'servono almeno due note')
  assert.notEqual(ID_NOTA_IN_CONTESTO, ID_NOTA_FUORI)
})

// --- contesto e risposta di prova ---------------------------------------------------

const fonti: Fonte[] = [
  { tipo: 'versetto', ref: ID_IN_CONTESTO, etichetta: etichettaVersetto(ID_IN_CONTESTO) },
  { tipo: 'nota', ref: ID_NOTA_IN_CONTESTO, etichetta: `nota:${ID_NOTA_IN_CONTESTO}` },
]

/** Solo riferimenti e lettere di servizio: nessuna parola di testo biblico. */
const risposta = [
  `A [${etichettaVersetto(ID_IN_CONTESTO)}]`,
  `B [${etichettaVersetto(ID_CURATO_FUORI)}]`,
  `C [${etichettaVersetto(ID_NON_CURATO!)}]`,
  `D [${ETICHETTA_INESISTENTE}]`,
  `E [nota:${ID_NOTA_IN_CONTESTO}]`,
  `F [nota:${ID_NOTA_FUORI}]`,
  'G [nota:non-esiste]',
  'H [parentesi quadre che non sono un riferimento]',
].join(' ')

const analisi = () => analizzaRisposta(risposta, { fonti, testoVersetto, nota, versettoEsiste })
const rif = (etichetta: string): SegmentoRif => {
  const s = analisi().segmenti.find((x) => x.tipo === 'rif' && x.etichetta === etichetta)
  assert.ok(s && s.tipo === 'rif', `nessun segmento di riferimento per "${etichetta}"`)
  return s
}

// --- i quattro esiti richiesti dalla specifica §9 -----------------------------------

test('riferimento valido e recuperato → versetto, col testo preso dal database', () => {
  const s = rif(etichettaVersetto(ID_IN_CONTESTO))
  assert.equal(s.esito, 'versetto')
  assert.equal(s.refTipo, 'versetto')
  // Il cuore del guardrail: byte per byte il file, non una parafrasi del modello.
  assert.equal(s.versettoTesto, letterale.testi[ID_IN_CONTESTO])
  assert.equal(s.primaOccorrenza, true)
})

test('nota valida e recuperata → nota, con titolo e testo dal database', () => {
  const s = rif(`nota:${ID_NOTA_IN_CONTESTO}`)
  assert.equal(s.esito, 'nota')
  assert.equal(s.notaTitolo, mappaNote.get(ID_NOTA_IN_CONTESTO)!.titolo)
  assert.equal(s.notaTesto, mappaNote.get(ID_NOTA_IN_CONTESTO)!.testo)
})

test('riferimento reale ma fuori dal contesto recuperato → fuori-contesto, senza testo', () => {
  for (const etichetta of [etichettaVersetto(ID_CURATO_FUORI), `nota:${ID_NOTA_FUORI}`]) {
    const s = rif(etichetta)
    assert.equal(s.esito, 'fuori-contesto', etichetta)
    assert.equal(s.versettoTesto, undefined, etichetta)
    assert.equal(s.notaTesto, undefined, etichetta)
  }
})

test('riferimento inventato → inesistente, senza testo', () => {
  for (const etichetta of [ETICHETTA_INESISTENTE, 'nota:non-esiste']) {
    const s = rif(etichetta)
    assert.equal(s.esito, 'inesistente', etichetta)
    assert.equal(s.versettoTesto, undefined, etichetta)
    assert.equal(s.notaTesto, undefined, etichetta)
  }
})

test('versetto reale ma privo di testo curato → non-curato, non "inesistente"', () => {
  const s = rif(etichettaVersetto(ID_NON_CURATO!))
  // Senza testo curato l'app non ha nulla da inserire: il riferimento resta bloccato.
  // Ma il dataset lo contiene, quindi dichiararlo inesistente sarebbe falso.
  assert.equal(s.esito, 'non-curato')
  assert.equal(s.versettoTesto, undefined)
  assert.ok(versettoEsiste(s.ref), 'il caso ha senso solo se il versetto esiste davvero')
})

test('un versetto che il dataset non contiene resta inesistente', () => {
  const s = rif(ETICHETTA_INESISTENTE)
  assert.equal(s.esito, 'inesistente')
  assert.equal(versettoEsiste(s.ref), false)
})

test('senza l\'elenco dei versetti si ricade sull\'esito più prudente', () => {
  // È lo stato dell'assistente mentre verses/*.json sono ancora in caricamento:
  // non deve mai promuovere un riferimento per un dato che non ha.
  const { segmenti } = analizzaRisposta(`X [${etichettaVersetto(ID_NON_CURATO!)}]`, {
    fonti,
    testoVersetto,
    nota,
    versettoEsiste: () => false,
  })
  const s = segmenti.find((x) => x.tipo === 'rif')
  assert.ok(s && s.tipo === 'rif')
  assert.equal(s.esito, 'inesistente')
  assert.equal(s.versettoTesto, undefined)
})

// --- proprietà trasversali ------------------------------------------------------------

test('ogni riferimento non verificato finisce in anomalie', () => {
  const { segmenti, anomalie } = analisi()
  // Verificato = risolve nel dataset E era nel contesto recuperato. Tutto il resto,
  // qualunque esito porti, dev'essere segnalato: il controllo è per esclusione
  // apposta, così un esito aggiunto in futuro non può essere dimenticato qui.
  const nonVerificati = segmenti.filter(
    (s) => s.tipo === 'rif' && s.esito !== 'versetto' && s.esito !== 'nota',
  )
  assert.equal(anomalie.length, nonVerificati.length)
  assert.equal(anomalie.length, 5, 'B, C, D, F, G')
})

test('solo i segmenti verificati portano testo dal database', () => {
  for (const s of analisi().segmenti) {
    if (s.tipo !== 'rif') continue
    if (s.esito === 'versetto') assert.ok(s.versettoTesto, s.etichetta)
    else assert.equal(s.versettoTesto, undefined, s.etichetta)
  }
})

test('le parentesi quadre che non sono riferimenti restano testo', () => {
  const { segmenti } = analisi()
  const testi = segmenti.filter((s) => s.tipo === 'testo').map((s) => s.testo)
  assert.ok(
    testi.some((t) => t.includes('[parentesi quadre che non sono un riferimento]')),
    'il guardrail non deve promuovere a riferimento una stringa qualunque',
  )
  // Nessun segmento di riferimento è stato creato per quella stringa.
  assert.ok(!segmenti.some((s) => s.tipo === 'rif' && s.etichetta.includes('parentesi quadre')))
})

test('il testo del modello non viene mai promosso a testo di versetto', () => {
  // Una risposta che cita testo tra virgolette (ciò che la regola 4 del prompt vieta):
  // deve restare prosa, senza diventare il testo di nessun riferimento.
  const inventato = 'Zzz qqq wwww kkkk.'
  const { segmenti } = analizzaRisposta(
    `«${inventato}» [${etichettaVersetto(ID_IN_CONTESTO)}]`,
    { fonti, testoVersetto, nota, versettoEsiste },
  )
  const versetto = segmenti.find((s) => s.tipo === 'rif' && s.esito === 'versetto')
  assert.ok(versetto && versetto.tipo === 'rif')
  assert.equal(versetto.versettoTesto, letterale.testi[ID_IN_CONTESTO])
  assert.ok(!versetto.versettoTesto!.includes(inventato))
})

test('un versetto citato due volte porta il testo solo la prima volta', () => {
  const e = etichettaVersetto(ID_IN_CONTESTO)
  const { segmenti } = analizzaRisposta(`X [${e}] Y [${e}]`, { fonti, testoVersetto, nota, versettoEsiste })
  const occorrenze = segmenti.filter((s) => s.tipo === 'rif' && s.esito === 'versetto')
  assert.equal(occorrenze.length, 2)
  assert.equal((occorrenze[0] as SegmentoRif).primaOccorrenza, true)
  assert.equal((occorrenze[1] as SegmentoRif).primaOccorrenza, false)
})
