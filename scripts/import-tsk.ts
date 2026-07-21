// scripts/import-tsk.ts — Task F1.5.
// Genera public/data/crossrefs/<libro>.json a partire dal Treasury of Scripture
// Knowledge, Enhanced (TSKe), rimappando la versificazione KJV sul TM con TVTMS.
//
// SORGENTI (entrambe in scripts/sources/, in .gitignore)
// -----------------------------------------------------
// 1. biblewebapp-master/input/com_tske/tske.txt — "The Treasury of Scripture
//    Knowledge, Enhanced" v1.2. ATTENZIONE ALLA LICENZA: il TSK originale è
//    pubblico dominio, ma QUESTA edizione ampliata è coperta da copyright
//    derivativo (© 2010 Timothy S. Morton, BibleAnalyzer.com) con permesso di
//    ridistribuzione solo a titolo gratuito, in formato aperto e con la nota di
//    copyright allegata. Fonte e licenza reali finiscono nel meta dei file
//    generati: non vanno riscritte come "pubblico dominio".
// 2. STEPBible-Data/Versification/TVTMS…txt — mappature di versificazione, CC BY 4.0.
//
// FORMATO DELLA SORGENTE
// ----------------------
// TSV a due colonne: riferimento nella forma "Gen 1:1", poi un blocco HTML.
// Esistono anche righe di intestazione di libro ("Gen") e di capitolo ("Gen 1:"),
// che contengono prosa introduttiva e nessun riferimento utile: si scartano.
// Nel blocco HTML i riferimenti sono i soli contenuti di <u>…</u>, nella forma
// "Psa_33:6" oppure "Pro_8:22-24" (range sempre dentro lo stesso capitolo:
// verificato sull'intero file, zero range che scavalcano il capitolo).
// Il resto — titoletti in <b> ("beginning:"), la sezione "Reciprocal:" e le sue
// glosse in inglese — è commento: lo schema §2.8 non ha un campo per ospitarlo e
// tenerlo significherebbe portarsi in casa testo inglese non richiesto. Si
// scarta, tranne i riferimenti dei reciprocal, che sono riferimenti a tutti gli
// effetti (sono anzi il valore aggiunto di questa edizione).
//
// SCELTE DI CONVERSIONE
// ---------------------
// - Solo le righe il cui `da` è nel Pentateuco: il resto della Bibbia non è in app.
// - I range si espandono in un riferimento per versetto: lo schema ammette solo
//   riferimenti puntuali e l'espansione è esatta finché il range resta nel capitolo.
// - Versificazione: TSKe è numerato come la KJV, sia nella chiave sia nei
//   riferimenti. Si rimappa sul TM (stessa direzione e stessa logica di
//   import-luzzi.ts) SOLO ciò che cade nel Pentateuco — per gli altri libri non
//   abbiamo né testo né inventario TM, quindi restano nella numerazione della
//   fonte, e il meta lo dichiara.
// - `interno` = destinazione nel Pentateuco. `tipo` e `curato` sono campi di
//   curation: null / false all'import.
// - Deduplica su (da, a) e scarto dei rimandi a sé stesso (la fusione dei range e
//   la sezione reciprocal ne producono).
//
// I file prodotti sono [G]: mai editarli a mano, si corregge qui e si rigenera.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { LibroCrossref, LibroVersetti, type CodiceLibro, type Crossref } from '../src/tipi/index.ts'

const FILE_TSK = path.join('scripts', 'sources', 'biblewebapp-master', 'input', 'com_tske', 'tske.txt')
const FILE_TVTMS = path.join(
  'scripts',
  'sources',
  'STEPBible-Data',
  'Versification',
  'TVTMS - Translators Versification Traditions with Methodology for Standardisation for Eng+Heb+Lat+Grk+Others - STEPBible.org CC BY.txt',
)
const DIR_CROSSREFS = path.join('public', 'data', 'crossrefs')
const DIR_VERSETTI = path.join('public', 'data', 'verses')

/** Sigla TSKe/TVTMS → codice libro nostro, per i soli libri in app. */
const LIBRI: { codice: CodiceLibro; sigla: string }[] = [
  { codice: 'gen', sigla: 'Gen' },
  { codice: 'exo', sigla: 'Exo' },
  { codice: 'lev', sigla: 'Lev' },
  { codice: 'num', sigla: 'Num' },
  { codice: 'deu', sigla: 'Deu' },
]
const CODICE_DA_SIGLA = new Map(LIBRI.map((l) => [l.sigla, l.codice]))

const META = {
  fonte: 'Treasury of Scripture Knowledge, Enhanced (TSKe) v1.2',
  licenza:
    '© 2010 Timothy S. Morton (BibleAnalyzer.com), copyright derivativo sul TSK di pubblico dominio; ridistribuzione permessa solo a titolo gratuito, in formato aperto e con questa nota allegata.',
  generato: new Date().toISOString().slice(0, 10),
  script: 'import-tsk v0.1',
}

const errori: string[] = []
const avvisi: string[] = []

function err(rif: string, messaggio: string): void {
  errori.push(`${rif} — ${messaggio}`)
}

// ---------------------------------------------------------------------------
// 1. TVTMS: mappa KJV → TM, limitata al Pentateuco
// ---------------------------------------------------------------------------
// Nota: import-luzzi.ts costruisce la stessa mappa, ma lì serve anche a decidere
// quali versetti TM restano senza testo (meta.lacune) e il codice è intrecciato a
// quella logica. Qui il fabbisogno è più piccolo — solo la rinumerazione — e si
// riscrive in una ventina di righe invece di rifattorizzare uno script chiuso e
// verificato. Se dovesse servirne una terza copia, allora vale l'estrazione.

/** "Gen.32:1" → parti, solo se riferimento semplice (niente "!a", ";", range). */
function analizzaRifTvtms(grezzo: string): { sigla: string; capitolo: number; numero: number } | null {
  const m = /^([1-3]?[A-Za-z]{2,3})\.(\d+):(\d+)$/.exec(grezzo.trim())
  if (!m) return null
  return { sigla: m[1], capitolo: Number(m[2]), numero: Number(m[3]) }
}

/** kjv "gen.32.1" → id TM "gen.31.55" … (chiavi e valori già nella nostra forma). */
const mappaKjvVersoTm = new Map<string, string>()

function leggiTvtms(): void {
  if (!existsSync(FILE_TVTMS)) {
    err(FILE_TVTMS, 'file TVTMS assente (clonare github.com/STEPBible/STEPBible-Data in scripts/sources/)')
    return
  }
  const righe = readFileSync(FILE_TVTMS, 'utf8').split(/\r?\n/)
  const inizio = righe.findIndex((r) => r.startsWith('#DataStart(Expanded)'))
  const fine = righe.findIndex((r) => r.startsWith('#DataEnd(Expanded)'))
  if (inizio < 0 || fine < 0 || fine <= inizio) {
    err(FILE_TVTMS, 'sezione #DataStart(Expanded)…#DataEnd(Expanded) non trovata')
    return
  }
  for (const riga of righe.slice(inizio + 1, fine)) {
    const col = riga.split('\t')
    if (col.length < 9) continue
    const [sourceType, sourceRef, standardRef, action] = col
    if (sourceType === '' || sourceType === 'SourceType' || sourceRef === '') continue
    const tipi = sourceType.split('+').map((s) => s.trim())
    // SourceType "Hebrew" ⇒ SourceRef = TM, StandardRef = KJV. Le righe che
    // elencano anche Eng-KJV descrivono un punto in cui le due tradizioni
    // coincidono: non generano rimappaggio.
    if (!tipi.includes('Hebrew') || tipi.includes('Eng-KJV')) continue
    if (sourceRef.trim() === standardRef.trim()) continue

    const tm = analizzaRifTvtms(sourceRef)
    const kjv = analizzaRifTvtms(standardRef)
    // Riferimenti composti ("Num.25:19; 26:1") o suddivisi ("Num.26:1!a"):
    // descrivono fusioni/divisioni di versetti, non rinumerazioni. Per i crossref
    // non c'è nulla da spostare — il versetto TM coinvolto resterà semplicemente
    // senza riferimenti propri, e il riepilogo lo segnala.
    if (!tm || !kjv) continue
    if (!CODICE_DA_SIGLA.has(tm.sigla) || !CODICE_DA_SIGLA.has(kjv.sigla)) continue
    if (!['Renumber verse', 'Keep verse'].includes(action.trim())) continue

    const daKjv = `${CODICE_DA_SIGLA.get(kjv.sigla)}.${kjv.capitolo}.${kjv.numero}`
    const aTm = `${CODICE_DA_SIGLA.get(tm.sigla)}.${tm.capitolo}.${tm.numero}`
    const precedente = mappaKjvVersoTm.get(daKjv)
    if (precedente !== undefined && precedente !== aTm) {
      // Due versetti TM sullo stesso versetto KJV (fusione): il rimappaggio non è
      // una funzione. Si tiene il primo e lo si dichiara, invece di sceglierne uno
      // in silenzio.
      avvisi.push(`TVTMS: ${daKjv} (KJV) corrisponde sia a ${precedente} sia a ${aTm} (TM); mantenuto ${precedente}`)
      continue
    }
    mappaKjvVersoTm.set(daKjv, aTm)
  }
}

leggiTvtms()

/** Applica il rimappaggio a un riferimento già nella nostra forma; fuori dal Pentateuco è identità. */
function versoTm(rif: string): string {
  return mappaKjvVersoTm.get(rif) ?? rif
}

// ---------------------------------------------------------------------------
// 2. Lettura del TSKe
// ---------------------------------------------------------------------------

/** "Gen 1:1" → { sigla, capitolo, numero }; null per le righe di libro/capitolo. */
function analizzaChiave(grezzo: string): { sigla: string; capitolo: number; numero: number } | null {
  const m = /^([1-3]?[A-Za-z]{2,3}) (\d+):(\d+)$/.exec(grezzo.trim())
  if (!m) return null
  return { sigla: m[1], capitolo: Number(m[2]), numero: Number(m[3]) }
}

/** Sigla TSKe → codice a tre caratteri usato negli id ("1Ch" → "1ch", "Psa" → "psa"). */
function codiceLibroRif(sigla: string): string {
  return sigla.toLowerCase()
}

/** "Pro_8:22-24" → ["pro.8.22", "pro.8.23", "pro.8.24"]; null se la forma è ignota. */
function espandiRiferimento(grezzo: string): string[] | null {
  const m = /^([1-3]?[A-Za-z]{2,3})_(\d+):(\d+)(?:-(\d+))?$/.exec(grezzo.trim())
  if (!m) return null
  const libro = codiceLibroRif(m[1])
  const capitolo = Number(m[2])
  const primo = Number(m[3])
  const ultimo = m[4] === undefined ? primo : Number(m[4])
  if (ultimo < primo) return null
  const out: string[] = []
  for (let v = primo; v <= ultimo; v++) out.push(`${libro}.${capitolo}.${v}`)
  return out
}

if (!existsSync(FILE_TSK)) {
  err(FILE_TSK, 'file TSKe assente (attesa la sorgente biblewebapp con input/com_tske/tske.txt)')
}

/** codice libro → mappa id TM "da" → insieme ordinato di destinazioni. */
const perLibro = new Map<CodiceLibro, Map<string, Set<string>>>()
for (const { codice } of LIBRI) perLibro.set(codice, new Map())

let righeLette = 0
let righeSaltate = 0
let riferimentiGrezzi = 0
let daRimappati = 0
let aRimappati = 0
let autoriferimenti = 0
let duplicati = 0
const formeIgnote = new Set<string>()

if (errori.length === 0) {
  for (const riga of readFileSync(FILE_TSK, 'utf8').split(/\r?\n/)) {
    if (riga.trim() === '') continue
    const [chiaveGrezza, corpo = ''] = riga.split('\t')
    const chiave = analizzaChiave(chiaveGrezza)
    if (!chiave) {
      righeSaltate++ // intestazioni di libro/capitolo: prosa, nessun riferimento utile
      continue
    }
    const codice = CODICE_DA_SIGLA.get(chiave.sigla)
    if (!codice) continue // fuori dal Pentateuco
    righeLette++

    const daKjv = `${codice}.${chiave.capitolo}.${chiave.numero}`
    const da = versoTm(daKjv)
    if (da !== daKjv) daRimappati++

    const destinazioni = perLibro.get(codice)!.get(da) ?? new Set<string>()
    perLibro.get(codice)!.set(da, destinazioni)

    for (const tag of corpo.matchAll(/<u>([^<]*)<\/u>/g)) {
      riferimentiGrezzi++
      const espanso = espandiRiferimento(tag[1])
      if (!espanso) {
        formeIgnote.add(tag[1].trim())
        continue
      }
      for (const rifKjv of espanso) {
        const rif = versoTm(rifKjv)
        if (rif !== rifKjv) aRimappati++
        if (rif === da) {
          autoriferimenti++
          continue
        }
        if (destinazioni.has(rif)) duplicati++
        destinazioni.add(rif)
      }
    }
  }
}

if (formeIgnote.size > 0)
  err('TSKe', `${formeIgnote.size} forme di riferimento non riconosciute (es. ${[...formeIgnote].slice(0, 5).join(', ')})`)

// ---------------------------------------------------------------------------
// 3. Riscontro sull'inventario TM prodotto dall'import TAHOT
// ---------------------------------------------------------------------------

const idTmEsistenti = new Map<CodiceLibro, Set<string>>()
for (const { codice } of LIBRI) {
  const percorso = path.join(DIR_VERSETTI, `${codice}.json`)
  if (!existsSync(percorso)) {
    err(percorso, 'inventario TM assente: eseguire prima scripts/import-tahot.ts')
    continue
  }
  const libro = LibroVersetti.parse(JSON.parse(readFileSync(percorso, 'utf8')))
  idTmEsistenti.set(codice, new Set(libro.versetti.map((v) => v.id)))
}

/** Un riferimento è interno se cade su un versetto TM realmente esistente. */
function interno(rif: string): boolean {
  const codice = rif.split('.')[0] as CodiceLibro
  const inventario = idTmEsistenti.get(codice)
  return inventario !== undefined && inventario.has(rif)
}

const scopertiPerLibro = new Map<CodiceLibro, string[]>()
for (const { codice } of LIBRI) {
  const inventario = idTmEsistenti.get(codice)
  if (!inventario) continue
  const presenti = perLibro.get(codice)!
  for (const da of presenti.keys())
    if (!inventario.has(da)) err(da, 'id "da" prodotto dal rimappaggio ma inesistente nel testo ebraico')
  scopertiPerLibro.set(
    codice,
    [...inventario].filter((id) => !presenti.has(id) || presenti.get(id)!.size === 0),
  )
}

// Destinazioni nel Pentateuco che il rimappaggio non ha fatto atterrare su un
// versetto TM esistente: sarebbero marcate "interno: false" per sbaglio.
for (const [, presenti] of perLibro)
  for (const [da, destinazioni] of presenti)
    for (const rif of destinazioni) {
      const codice = rif.split('.')[0]
      if (CODICE_DA_SIGLA.has(codice.charAt(0).toUpperCase() + codice.slice(1)) && !interno(rif))
        err(`${da} → ${rif}`, 'destinazione nel Pentateuco che non corrisponde a nessun versetto TM')
    }

// ---------------------------------------------------------------------------
// 4. Scrittura
// ---------------------------------------------------------------------------

if (errori.length > 0) {
  console.error(`import-tsk: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori) console.error(`  - ${e}`)
  process.exit(1)
}

mkdirSync(DIR_CROSSREFS, { recursive: true })

/** Ordinamento naturale sugli id ("gen.2.10" dopo "gen.2.9"). */
function chiaveOrdinamento(rif: string): [string, number, number] {
  const [libro, cap, ver] = rif.split('.')
  return [libro, Number(cap), Number(ver)]
}

function confronta(a: string, b: string): number {
  const [la, ca, va] = chiaveOrdinamento(a)
  const [lb, cb, vb] = chiaveOrdinamento(b)
  return la === lb ? (ca === cb ? va - vb : ca - cb) : la.localeCompare(lb)
}

const conteggi: { codice: CodiceLibro; versetti: number; riferimenti: number; interni: number }[] = []

for (const { codice } of LIBRI) {
  const presenti = perLibro.get(codice)!
  const riferimenti: Crossref[] = []
  for (const da of [...presenti.keys()].sort(confronta))
    for (const a of [...presenti.get(da)!].sort(confronta))
      riferimenti.push({ da, a, interno: interno(a), tipo: null, curato: false })

  const file = LibroCrossref.parse({ meta: META, riferimenti })
  // Un riferimento per riga: file [G] ispezionabile e diff leggibili tra rigenerazioni.
  const corpo = file.riferimenti.map((r) => `  ${JSON.stringify(r)}`).join(',\n')
  writeFileSync(
    path.join(DIR_CROSSREFS, `${codice}.json`),
    `{\n${JSON.stringify('meta')}: ${JSON.stringify(file.meta)},\n${JSON.stringify('riferimenti')}: [\n${corpo}\n]\n}\n`,
    'utf8',
  )
  conteggi.push({
    codice,
    versetti: presenti.size,
    riferimenti: riferimenti.length,
    interni: riferimenti.filter((r) => r.interno).length,
  })
}

// ---------------------------------------------------------------------------
// 5. Riepilogo
// ---------------------------------------------------------------------------

console.log('import-tsk: generazione completata.\n')
console.log(`  fonte:   ${META.fonte}`)
console.log(`  licenza: ${META.licenza}\n`)
console.log(`  righe TSKe di versetto lette (Pentateuco): ${righeLette}`)
console.log(`  righe di intestazione libro/capitolo scartate (tutta la Bibbia): ${righeSaltate}`)
console.log(`  tag <u> letti: ${riferimentiGrezzi} (espansi nei range, deduplicati)`)
console.log(`    autoriferimenti scartati: ${autoriferimenti}`)
console.log(`    duplicati fusi:           ${duplicati}`)
console.log(`\n  rimappaggio versificazione (TVTMS, KJV → TM, solo Pentateuco):`)
console.log(`    regole applicabili:       ${mappaKjvVersoTm.size}`)
console.log(`    chiavi "da" rinumerate:   ${daRimappati}`)
console.log(`    destinazioni rinumerate:  ${aRimappati}`)
console.log('\n  per libro:')
for (const c of conteggi) {
  const scoperti = scopertiPerLibro.get(c.codice) ?? []
  const totale = idTmEsistenti.get(c.codice)?.size ?? 0
  console.log(
    `    ${c.codice}: ${c.riferimenti} riferimenti (${c.interni} interni) su ${c.versetti}/${totale} versetti; senza riferimenti: ${scoperti.length}`,
  )
}
const scopertiTotali = [...scopertiPerLibro.values()].flat()
if (scopertiTotali.length > 0)
  console.log(`\n  versetti TM senza riferimenti: ${scopertiTotali.length} (es. ${scopertiTotali.slice(0, 5).join(', ')})`)
if (avvisi.length > 0) {
  console.log(`\n  avvisi (${avvisi.length}):`)
  for (const a of avvisi) console.log(`    - ${a}`)
}
