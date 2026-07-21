// scripts/import-tahot.ts — Task F1.1 + F1.2.
// Genera public/data/verses/<libro>.json, public/data/words/<libro>.json e
// public/data/indices/lemmi.json per i 5 libri del Pentateuco a partire dal file
// TAHOT Gen-Deu di STEPBible-Data
// (scripts/sources/, in .gitignore — clonare github.com/STEPBible/STEPBible-Data).
//
// Formato sorgente (documentato nell'intestazione del file TAHOT stesso):
// righe di dati TSV, una per parola ebraica, riconoscibili dal riferimento
// iniziale "Gen.1.1#01=L". Tutte le altre righe (preambolo, blocchi interlineari
// che iniziano con "#", intestazioni di colonna ripetute, righe vuote) si scartano.
//
// MAPPING COLONNE TAHOT → CAMPI NOSTRI (SCHEMI-DATI.md §2.1–2.2)
// ---------------------------------------------------------------
//  1. "Eng (Heb) Ref & Type"     → id versetto TM, pos, gestione Qere/LXX.
//     Forma: Eng.cap.ver[(cap.ver ebraico)]#numparola=tipo. La numerazione
//     canonica dell'app è quella TM: se c'è il riferimento tra parentesi
//     (dove le Bibbie inglesi divergono, es. Gen.31.55(32.1)) si usa QUELLO.
//     Il numero di parola TAHOT riparte da 01 per ogni versetto TM e diventa
//     la nostra pos (id parola = versetto TM + pos a due cifre).
//     Tipo: L (Leningrad, anche con varianti di manoscritti tra parentesi:
//     La/LBH(A)/…) → testo normale; Q(K)/Q(k) → il testo principale È il qere,
//     il ketiv sta nelle colonne varianti; X → parola assente dal TM,
//     retroversione dalla LXX (numerata #NNnn a 4 cifre): la SCARTIAMO, perché
//     la nostra base è il TM (l'esclusione è conteggiata nel riepilogo).
//  2. "Hebrew"                   → testo. Si rimuove "/" (separatore di
//     prefissi/suffissi); degli elementi dopo "\" (punteggiatura) si tengono
//     maqqef "־" e sof pasuq "׃" (ortografia della parola) e il paseq "׀"
//     (preceduto da spazio); si scartano i marcatori di layout di paragrafo
//     פ, ס, ׆ e gli spazi che li accompagnano. Ogni altro segmento si tiene
//     com'è (es. Gen.14.17#09, dove "\" divide una parola unica).
//  3. "Transliteration"          → translit della parola, senza i separatori "/".
//     Gli stessi segmenti separati da "/" sono anche allineati uno a uno con i
//     morfemi della colonna 12 (verificato su tutte le parole della sorgente,
//     scartando i segmenti vuoti o di soli spazi): è da lì che l'indice lemmi
//     ricava la traslitterazione per dStrong, dato che il singolo morfema non
//     ha una colonna propria. Se l'allineamento non torna per una parola, i suoi
//     morfemi semplicemente non votano la traslitterazione (conteggiato nel
//     riepilogo): meglio un campo vuoto che una traslitterazione sbagliata.
//  4. "English translation"      → non usata: le glosse per morfema vengono
//     dalla colonna 12, più adatte al pannello parola.
//  5. "dStrongs"                 → non usata direttamente (ridondante con la
//     colonna 12, che oltre ai dStrong porta lemma e glossa).
//  6. "Grammar"                  → morph, codice grezzo com'è (decodifica a
//     runtime in src/lib/morfologia.ts).
//  7. "Meaning Variants"         → ketiv per le parole Q(K) (variante che
//     tocca la traduzione): si estrae l'ebraico della voce "K= …".
//  8. "Spelling Variants"        → ketiv per le parole Q(k) (variante solo
//     grafica): stessa estrazione.
//  9. "Root dStrong+Instance"    → non usata (i dStrong stanno nei morfemi).
// 10. "Alternative Strongs"      → non usata (serve ad allineare altri dataset).
// 11. "Conjoin word"             → non usata ("Not yet implemented" nella fonte).
// 12. "Expanded Strong tags"     → morfemi[]. Forma: segmenti separati da "/"
//     (gli elementi dopo "\" sono punteggiatura e si scartano), ciascuno
//     "dStrong=lemma=glossa" con la radice tra {graffe} e un eventuale "+"
//     finale (stesso tag esteso alla parola successiva, es. Tubal-cain).
//     strong    = dStrong con lettera di disambiguazione (es. H7225G),
//                 chiave dell'indice lemmi (F1.2);
//     lemma     = campo centrale com'è (per i suffissi pronominali TAHOT dà
//                 un codice tipo "Ps3m", non un lemma ebraico: si copia fedele);
//     glossa_en = parte della glossa prima di "»" (dopo "»" c'è il
//                 sotto-significato o il nome più comune di persone/luoghi),
//                 senza il prefisso ": " e con "_" → spazio.
//
// INDICE LEMMI (F1.2, SCHEMI-DATI.md §2.9)
// ----------------------------------------
// indices/lemmi.json è un aggregato delle stesse parole scritte in words/:
// una voce per dStrong, con le occorrenze in ordine canonico (id parola, non
// versetto: il pannello parola deve poter evidenziare la parola esatta). Una
// parola compare una volta sola per dStrong anche se lo stesso tag si ripete su
// più suoi morfemi. lemma/translit/glossa_en della voce sono il valore più
// frequente tra le occorrenze (a parità, il primo incontrato): su ~4.000 dStrong
// solo una ventina hanno varianti, quasi tutte suffissi pronominali dove TAHOT
// alterna la forma del codice ("Os3m"/"Ss3m") o la glossa secondo il caso
// sintattico. Scegliere il più frequente evita che una singola voce anomala
// diventi l'etichetta del lemma in UI.
//
// I file prodotti sono [G]: mai editarli a mano, si corregge qui e si rigenera.
// Formato di scrittura: un record per riga, così i file restano ispezionabili
// e i diff tra rigenerazioni leggibili senza gonfiare troppo la dimensione.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  IndiceLemmi,
  LibroParole,
  LibroVersetti,
  type CodiceLibro,
  type Morfema,
  type Parola,
  type Versetto,
  type VoceLemma,
} from '../src/tipi/index.ts'

const SORGENTE = path.join(
  'scripts',
  'sources',
  'STEPBible-Data',
  'Translators Amalgamated OT+NT',
  'TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
)

const LIBRI: Record<string, { codice: CodiceLibro; nome_it: string }> = {
  Gen: { codice: 'gen', nome_it: 'Genesi' },
  Exo: { codice: 'exo', nome_it: 'Esodo' },
  Lev: { codice: 'lev', nome_it: 'Levitico' },
  Num: { codice: 'num', nome_it: 'Numeri' },
  Deu: { codice: 'deu', nome_it: 'Deuteronomio' },
}

const META = {
  fonte: 'STEPBible TAHOT (Translators Amalgamated Hebrew OT), Tyndale House Cambridge — github.com/STEPBible/STEPBible-Data',
  licenza: 'CC BY 4.0',
  generato: new Date().toISOString().slice(0, 10),
  script: 'import-tahot v0.2',
}

// ---------------------------------------------------------------------------
// Errori: si raccolgono tutti e non si scrive nulla se ce n'è almeno uno.
// ---------------------------------------------------------------------------

const errori: string[] = []

function err(rif: string, messaggio: string): void {
  errori.push(`${rif} — ${messaggio}`)
}

// ---------------------------------------------------------------------------
// Pulizia dei campi
// ---------------------------------------------------------------------------

/** Marcatori di layout (paragrafo/sezione) da escludere dal testo della parola. */
const MARCATORI_LAYOUT = new Set([' ', 'פ', 'ס', '׆'])

/** Colonna Hebrew → testo: via i "/", tenuta la punteggiatura ortografica dopo "\". */
function pulisciEbraico(campo: string): string {
  const [testa, ...codaPunteggiatura] = campo.split('\\')
  let out = testa.replaceAll('/', '')
  for (const seg of codaPunteggiatura) {
    if (MARCATORI_LAYOUT.has(seg)) continue
    if (seg === '׀') out += ' ׀'
    else out += seg.replaceAll('/', '')
  }
  return out
}

/** Glossa TAHOT → glossa_en: parte prima di "»", senza prefisso ": ", "_" → spazio. */
function pulisciGlossa(grezza: string): string {
  let g = grezza.split('»')[0]
  if (g.startsWith(':')) g = g.slice(1)
  return g.replaceAll('_', ' ').trim()
}

/**
 * Colonna 12 → morfemi, più la traslitterazione di ciascuno presa dalla colonna 3.
 * Gli elementi dopo "\" (punteggiatura tipo H9016=׃) si scartano in entrambe.
 * `translitMorfemi[i]` vale "" se l'allineamento non torna (o se il segmento manca).
 */
function analizzaMorfemi(
  colonna: string,
  colonnaTranslit: string,
  rif: string,
): { morfemi: Morfema[]; translitMorfemi: string[] } {
  const testa = colonna.split('\\')[0]
  if (testa === '') return { morfemi: [], translitMorfemi: [] }
  // Split su "/", riunendo i pezzi che non aprono un nuovo tag (glosse contenenti "/").
  const segmenti: string[] = []
  for (const pezzo of testa.split('/')) {
    if (segmenti.length > 0 && !/^\{?H\d{4}/.test(pezzo)) segmenti[segmenti.length - 1] += `/${pezzo}`
    else segmenti.push(pezzo)
  }
  // Segmenti di traslitterazione: vuoti e soli spazi via (li producono "//" e "+/ /").
  const segmentiTranslit = colonnaTranslit
    .split('\\')[0]
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const allineata = segmentiTranslit.length === segmenti.length
  if (!allineata) contaTranslitNonAllineate++

  const morfemi: Morfema[] = []
  const translitMorfemi: string[] = []
  for (const [i, grezzo] of segmenti.entries()) {
    let s = grezzo
    if (s.startsWith('{')) s = s.slice(1)
    if (s.endsWith('+')) s = s.slice(0, -1)
    if (s.endsWith('}')) s = s.slice(0, -1)
    const m = /^(H\d{4}[A-Za-z]?)=([^=]*)=(.*)$/.exec(s)
    if (!m) {
      err(rif, `morfema non analizzabile negli Expanded Strong tags: "${s}"`)
      continue
    }
    morfemi.push({ strong: m[1], lemma: m[2], glossa_en: pulisciGlossa(m[3]) })
    translitMorfemi.push(allineata ? segmentiTranslit[i] : '')
  }
  return { morfemi, translitMorfemi }
}

/** Estrae l'ebraico della voce "K= …" dalle colonne varianti (parole Qere). */
function estraiKetiv(meaningVar: string, spellingVar: string, rif: string): string | null {
  for (const colonna of [meaningVar, spellingVar]) {
    const m = /(?:^|;)\s*K=\s*([^;¦]*)/.exec(colonna)
    if (!m) continue
    let grezzo = m[1].trim()
    // Nelle Meaning Variants la voce è "K= translit (ebraico) "glossa" (tag)": si prende la prima parentesi.
    const parentesi = /\(([^)]*)\)/.exec(grezzo)
    if (parentesi) grezzo = parentesi[1]
    grezzo = grezzo.replaceAll('…', '').trim()
    if (grezzo !== '') return pulisciEbraico(grezzo)
  }
  err(rif, 'parola Qere senza voce "K= …" nelle colonne varianti')
  return null
}

// ---------------------------------------------------------------------------
// Parsing del file
// ---------------------------------------------------------------------------

// Es.: "Gen.1.1#01=L" · "Gen.31.55(32.1)#01=L" · "Gen.4.8#0501=X" · "Gen.9.21#07=Q(K)"
const RE_RIF = /^(Gen|Exo|Lev|Num|Deu)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=(.+)$/

interface ParolaGrezza {
  pos: number
  parola: Omit<Parola, 'id' | 'verso' | 'pos'>
  /** Traslitterazione per morfema, stesso ordine di parola.morfemi ("" se non allineata). */
  translitMorfemi: string[]
}

// libro → "cap.ver" TM → parole per numero TAHOT
const dati = new Map<CodiceLibro, Map<string, Map<number, ParolaGrezza>>>()
for (const { codice } of Object.values(LIBRI)) dati.set(codice, new Map())

let contaQere = 0
let contaEscluseX = 0
let contaTranslitNonAllineate = 0

if (!existsSync(SORGENTE)) {
  console.error(`Sorgente non trovata: ${SORGENTE}`)
  console.error('Clonare github.com/STEPBible/STEPBible-Data in scripts/sources/.')
  process.exit(1)
}

const righe = readFileSync(SORGENTE, 'utf8').split(/\r?\n/)

for (const riga of righe) {
  if (!/^(Gen|Exo|Lev|Num|Deu)\.\d/.test(riga)) continue
  const colonne = riga.split('\t')
  const m = RE_RIF.exec(colonne[0])
  if (!m) {
    err(colonne[0], 'riferimento non analizzabile')
    continue
  }
  const [, libroEng, capEng, verEng, capHeb, verHeb, numParola, tipo] = m
  const { codice } = LIBRI[libroEng]

  if (tipo.startsWith('X')) {
    contaEscluseX++
    continue
  }

  // Numerazione TM: il riferimento ebraico tra parentesi, quando presente, prevale.
  const capitolo = capHeb !== undefined ? Number(capHeb) : Number(capEng)
  const numero = verHeb !== undefined ? Number(verHeb) : Number(verEng)
  const chiaveVerso = `${capitolo}.${numero}`
  const pos = Number(numParola)
  const rif = `${codice}.${chiaveVerso}#${numParola}`

  const testo = pulisciEbraico(colonne[1])
  const eQere = tipo.startsWith('Q')
  let ketiv: string | null = null
  if (eQere) {
    contaQere++
    ketiv = estraiKetiv(colonne[6] ?? '', colonne[7] ?? '', rif)
  }

  const perVerso = dati.get(codice)!
  let verso = perVerso.get(chiaveVerso)
  if (!verso) {
    verso = new Map()
    perVerso.set(chiaveVerso, verso)
  }
  if (verso.has(pos)) {
    err(rif, 'numero di parola duplicato nel versetto')
    continue
  }
  const { morfemi, translitMorfemi } = analizzaMorfemi(colonne[11] ?? '', colonne[2] ?? '', rif)

  verso.set(pos, {
    pos,
    parola: {
      testo,
      translit: colonne[2].replaceAll('/', '').replaceAll('\\', ''),
      morph: colonne[5],
      morfemi,
      ketiv,
      qere: eQere ? testo : null,
    },
    translitMorfemi,
  })
}

// ---------------------------------------------------------------------------
// Assemblaggio per libro, verifica strutturale, scrittura
// ---------------------------------------------------------------------------

interface Riepilogo {
  libro: string
  capitoli: number
  versetti: number
  parole: number
}
const riepiloghi: Riepilogo[] = []

interface FileDaScrivere {
  percorso: string
  contenuto: string
}
const daScrivere: FileDaScrivere[] = []

/** Un record per riga: file [G] ispezionabili e diff leggibili senza pretty-print completo. */
function serializza(intestazione: Record<string, unknown>, campoLista: string, records: unknown[]): string {
  const testa = Object.entries(intestazione)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n')
  return `{\n${testa},\n${JSON.stringify(campoLista)}: [\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n`
}

/** Stessa logica per un dizionario: una voce per riga. */
function serializzaDizionario(intestazione: Record<string, unknown>, campoDizionario: string, voci: Record<string, unknown>): string {
  const testa = Object.entries(intestazione)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n')
  const corpo = Object.entries(voci)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n')
  return `{\n${testa},\n${JSON.stringify(campoDizionario)}: {\n${corpo}\n}\n}\n`
}

// Accumulatore dell'indice lemmi: i valori testuali si votano, le occorrenze si accodano
// in ordine canonico (i libri si scorrono nell'ordine di LIBRI, i versetti ordinati).
interface AccumuloLemma {
  lemma: Map<string, number>
  translit: Map<string, number>
  glossa_en: Map<string, number>
  occorrenze: string[]
}
const accumuloLemmi = new Map<string, AccumuloLemma>()

function vota(voti: Map<string, number>, valore: string): void {
  if (valore === '') return
  voti.set(valore, (voti.get(valore) ?? 0) + 1)
}

/** Valore più votato; a parità vince il primo incontrato (le Map conservano l'ordine di inserimento). */
function piuFrequente(voti: Map<string, number>): string {
  let migliore = ''
  let max = 0
  for (const [valore, conta] of voti)
    if (conta > max) {
      migliore = valore
      max = conta
    }
  return migliore
}

/** Ordinamento delle chiavi dStrong: numero, poi lettera di disambiguazione. */
function confrontaDStrong(a: string, b: string): number {
  const na = Number(a.slice(1).replace(/[A-Za-z]$/, ''))
  const nb = Number(b.slice(1).replace(/[A-Za-z]$/, ''))
  return na - nb || a.localeCompare(b)
}

for (const { codice, nome_it } of Object.values(LIBRI)) {
  const perVerso = dati.get(codice)!
  if (perVerso.size === 0) {
    err(codice, 'nessun versetto trovato nella sorgente')
    continue
  }

  const versetti: Versetto[] = []
  const parole: Parola[] = []

  const chiaviOrdinate = [...perVerso.keys()]
    .map((k) => ({ k, cap: Number(k.split('.')[0]), ver: Number(k.split('.')[1]) }))
    .sort((a, b) => a.cap - b.cap || a.ver - b.ver)

  for (const { k, cap, ver } of chiaviOrdinate) {
    const idVerso = `${codice}.${cap}.${ver}`
    const perPos = perVerso.get(k)!
    const posizioni = [...perPos.keys()].sort((a, b) => a - b)
    // Le pos TAHOT devono essere 1..N contigue (le parole X, escluse, non contano nella numerazione).
    for (let i = 0; i < posizioni.length; i++) {
      if (posizioni[i] !== i + 1) {
        err(idVerso, `numerazione parole non contigua: attesa ${i + 1}, trovata ${posizioni[i]}`)
        break
      }
    }
    if (posizioni[posizioni.length - 1] > 99) err(idVerso, 'più di 99 parole: id parola a due cifre impossibile')

    const idsParole: string[] = []
    for (const pos of posizioni) {
      const idParola = `${idVerso}.${String(pos).padStart(2, '0')}`
      idsParole.push(idParola)
      const grezza = perPos.get(pos)!
      parole.push({ id: idParola, verso: idVerso, pos, ...grezza.parola })

      // Indice lemmi: la parola conta una volta per dStrong, anche se il tag si ripete sui suoi morfemi.
      const dStrongDellaParola = new Set<string>()
      grezza.parola.morfemi.forEach((morfema, i) => {
        let acc = accumuloLemmi.get(morfema.strong)
        if (!acc) {
          acc = { lemma: new Map(), translit: new Map(), glossa_en: new Map(), occorrenze: [] }
          accumuloLemmi.set(morfema.strong, acc)
        }
        vota(acc.lemma, morfema.lemma)
        vota(acc.translit, grezza.translitMorfemi[i] ?? '')
        vota(acc.glossa_en, morfema.glossa_en)
        if (!dStrongDellaParola.has(morfema.strong)) {
          dStrongDellaParola.add(morfema.strong)
          acc.occorrenze.push(idParola)
        }
      })
    }
    versetti.push({ id: idVerso, capitolo: cap, numero: ver, parole: idsParole })
  }

  const capitoli = Math.max(...versetti.map((v) => v.capitolo))

  // Validazione Zod prima della scrittura: se qui qualcosa non torna, è un bug dello script.
  const fileVersetti = LibroVersetti.parse({ meta: META, libro: codice, nome_it, capitoli, versetti })
  const fileParole = LibroParole.parse({ meta: META, parole })

  daScrivere.push({
    percorso: path.join('public', 'data', 'verses', `${codice}.json`),
    contenuto: serializza({ meta: META, libro: codice, nome_it, capitoli }, 'versetti', fileVersetti.versetti),
  })
  daScrivere.push({
    percorso: path.join('public', 'data', 'words', `${codice}.json`),
    contenuto: serializza({ meta: META }, 'parole', fileParole.parole),
  })
  riepiloghi.push({ libro: `${nome_it} (${codice})`, capitoli, versetti: versetti.length, parole: parole.length })
}

// indices/lemmi.json — un solo file per l'intero Pentateuco (SCHEMI-DATI.md §2.9).
const lemmi: Record<string, VoceLemma> = {}
let occorrenzeTotali = 0
let lemmiSenzaTranslit = 0
for (const strong of [...accumuloLemmi.keys()].sort(confrontaDStrong)) {
  const acc = accumuloLemmi.get(strong)!
  const translit = piuFrequente(acc.translit)
  if (translit === '') lemmiSenzaTranslit++
  occorrenzeTotali += acc.occorrenze.length
  lemmi[strong] = {
    lemma: piuFrequente(acc.lemma),
    translit,
    glossa_en: piuFrequente(acc.glossa_en),
    occorrenze: acc.occorrenze,
  }
}
if (Object.keys(lemmi).length === 0) err('indices/lemmi.json', 'nessun lemma raccolto')
else {
  const fileLemmi = IndiceLemmi.parse({ meta: META, lemmi })
  daScrivere.push({
    percorso: path.join('public', 'data', 'indices', 'lemmi.json'),
    contenuto: serializzaDizionario({ meta: META }, 'lemmi', fileLemmi.lemmi),
  })
}

if (errori.length > 0) {
  console.error(`import-tahot: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori) console.error(`  - ${e}`)
  process.exit(1)
}

for (const { percorso } of daScrivere) mkdirSync(path.dirname(percorso), { recursive: true })
for (const { percorso, contenuto } of daScrivere) writeFileSync(percorso, contenuto, 'utf8')

console.log('import-tahot: generazione completata.\n')
for (const r of riepiloghi)
  console.log(`  ${r.libro.padEnd(20)} capitoli ${String(r.capitoli).padStart(2)}  versetti ${String(r.versetti).padStart(4)}  parole ${String(r.parole).padStart(5)}`)
console.log(`\n  totale versetti: ${riepiloghi.reduce((n, r) => n + r.versetti, 0)}`)
console.log(`  totale parole:   ${riepiloghi.reduce((n, r) => n + r.parole, 0)}`)
console.log(`  parole Qere (ketiv registrato): ${contaQere}`)
console.log(`  parole extra-TM dalla LXX escluse (tipo X): ${contaEscluseX}`)
console.log(`\n  indice lemmi: ${Object.keys(lemmi).length} dStrong distinti, ${occorrenzeTotali} occorrenze`)
console.log(`  lemmi senza traslitterazione: ${lemmiSenzaTranslit}`)
console.log(`  parole con traslitterazione non allineata ai morfemi: ${contaTranslitNonAllineate}`)
