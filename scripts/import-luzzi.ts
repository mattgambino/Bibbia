// scripts/import-luzzi.ts — Task F1.4.
// Genera public/data/translations/luzzi.json (e aggiorna il manifest) a partire
// dal testo della Riveduta 1927 di eBible.org, rimappando la versificazione
// sul TM con TVTMS di STEPBible-Data.
//
// SORGENTI (entrambe in scripts/sources/, in .gitignore)
// -----------------------------------------------------
// 1. ita1927_usfm/  — eBible.org "ita1927", The Holy Bible in Italian, Riveduta 1927,
//    pubblico dominio. Formato USFM, un file per libro.
//    Nota sulla fonte: ita1927metadata.xml e copr.htm di eBible contengono residui
//    di copia dalla scheda Diodati ("abbreviationLocal DO885", "The Diodati Bible was
//    published in 1885"). Nome, descrizione e dateCompleted dicono Riveduta 1927 e il
//    testo lo conferma: l'anno fissato nel meta è 1927. L'avvertenza resta in
//    meta.note per non perdersi tra una rigenerazione e l'altra.
// 2. STEPBible-Data/Versification/TVTMS…txt — mappature di versificazione, CC BY 4.0.
//
// FORMATO USFM DELLA SORGENTE
// ---------------------------
// I 5 file del Pentateuco usano solo \id \h \toc1-3 \mt1 (intestazioni, scartate),
// \c (capitolo), \p (paragrafo, scartato) e \v (versetto). Nessuna nota, nessun
// marcatore di carattere, nessuna riga di poesia: il testo del versetto è tutto
// sulla riga del suo \v. Righe di continuazione senza marcatore sono comunque
// gestite (si accodano al versetto aperto) e conteggiate, così se una futura
// edizione della fonte cambia forma ce ne accorgiamo.
//
// RIMAPPAGGIO DELLA VERSIFICAZIONE (il punto delicato del task)
// ------------------------------------------------------------
// TVTMS è orientato al contrario di quello che serve a noi: le sue righe dicono
// "SourceRef (in una Bibbia di tradizione X) = StandardRef (in KJV), SE i Tests
// sono veri". Le righe con SourceType "Hebrew" hanno quindi SourceRef = riferimento
// TM e StandardRef = riferimento KJV. A noi serve la direzione opposta
// (la Riveduta è versificata come la KJV), quindi la mappa si INVERTE:
// chiave KJV = StandardRef → valore TM = SourceRef.
//
// L'inversione è lecita solo dove la Riveduta NON segue già la numerazione ebraica.
// I Tests servono esattamente a stabilirlo e vengono valutati sull'inventario reale
// dei versetti della sorgente (le sole forme presenti nel Pentateuco sono
// "Rif=Exist" e "Rif=Last", in AND):
//   - Tests VERI  → la sorgente è versificata come il TM in quel punto: identità,
//                   nessun rimappaggio (e lo script lo segnala nel riepilogo);
//   - Tests FALSI → la sorgente non segue il TM: si applica la mappa invertita.
// Verificato sulla Riveduta: i Tests risultano falsi ovunque, coerente con una
// versificazione KJV (controprova: Gen 31 arriva a 55 e Gen 32 riparte da 1,
// mentre nel TM Gen 31 finisce a 54).
//
// Le righe con Action diversa da "Renumber verse"/"Keep verse", o con riferimenti
// composti ("Num.25:19; 26:1") o suddivisi ("Num.26:1!a"), descrivono fusioni e
// divisioni di versetti, non rinumerazioni. Non si possono applicare a un testo già
// stampato senza spezzarlo, cosa che significherebbe inventare dove tagliare.
// Trattamento: la parte di KJV che conserva il proprio riferimento ("Keep verse")
// prende il testo; il versetto TM rimasto senza sorgente diventa una LACUNA
// DICHIARATA in meta.lacune, con il motivo. Nel Pentateuco il caso è uno solo
// (num.25.19, che la KJV ingloba in Num 26:1). Il conto torna: TM 5853 versetti,
// Riveduta 5852.
//
// Il file prodotto è [G]: mai editarlo a mano, si corregge qui e si rigenera.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  LibroVersetti,
  ManifestTraduzioni,
  Traduzione,
  type CodiceLibro,
  type LacunaTraduzione,
} from '../src/tipi/index.ts'

const DIR_USFM = path.join('scripts', 'sources', 'ita1927_usfm')
const FILE_TVTMS = path.join(
  'scripts',
  'sources',
  'STEPBible-Data',
  'Versification',
  'TVTMS - Translators Versification Traditions with Methodology for Standardisation for Eng+Heb+Lat+Grk+Others - STEPBible.org CC BY.txt',
)
const DIR_TRADUZIONI = path.join('public', 'data', 'translations')
const DIR_VERSETTI = path.join('public', 'data', 'verses')

/** Codice libro nostro → nome file USFM e sigla TVTMS. */
const LIBRI: { codice: CodiceLibro; usfm: string; tvtms: string }[] = [
  { codice: 'gen', usfm: '02-GENita1927.usfm', tvtms: 'Gen' },
  { codice: 'exo', usfm: '03-EXOita1927.usfm', tvtms: 'Exo' },
  { codice: 'lev', usfm: '04-LEVita1927.usfm', tvtms: 'Lev' },
  { codice: 'num', usfm: '05-NUMita1927.usfm', tvtms: 'Num' },
  { codice: 'deu', usfm: '06-DEUita1927.usfm', tvtms: 'Deu' },
]
const CODICE_DA_TVTMS = new Map(LIBRI.map((l) => [l.tvtms, l.codice]))

const META = {
  id: 'luzzi',
  nome: 'Riveduta (Luzzi)',
  anno: 1927,
  lingua: 'it',
  licenza: 'pubblico dominio',
  completa: true,
  fonti: [
    {
      tipo: 'url' as const,
      titolo: 'The Holy Bible in Italian, Riveduta 1927 (ita1927 / itaRIV)',
      anno: 1927,
      url: 'https://ebible.org/find/details.php?id=itaRIV',
      dettaglio:
        'eBible.org, archivio USFM ita1927_usfm.zip; contributor dichiarato: Bible Society in Italy; file sorgente datati 12 dic 2025.',
    },
    {
      tipo: 'dataset' as const,
      titolo: 'TVTMS — Translators Versification Traditions, STEPBible.org',
      url: 'https://github.com/STEPBible/STEPBible-Data',
      dettaglio: 'CC BY 4.0, Tyndale House Cambridge. Usato per rimappare la versificazione KJV della sorgente sul TM.',
    },
  ],
  note: [
    'I metadata di eBible per questa edizione contengono residui di copia dalla scheda Diodati (abbreviationLocal "DO885", e in copr.htm "The Diodati Bible was published in 1885"). Nome, descrizione e dateCompleted della stessa fonte indicano la Riveduta 1927, confermata dal testo: l\'anno qui registrato è 1927.',
    'La sorgente è versificata come la KJV: tutte le chiavi di questo file sono già id TM, rimappati in import via TVTMS.',
  ],
  generato: new Date().toISOString().slice(0, 10),
  script: 'import-luzzi v0.1',
}

// ---------------------------------------------------------------------------
// Errori: si raccolgono tutti e non si scrive nulla se ce n'è almeno uno.
// ---------------------------------------------------------------------------

const errori: string[] = []
const avvisi: string[] = []

function err(rif: string, messaggio: string): void {
  errori.push(`${rif} — ${messaggio}`)
}

// ---------------------------------------------------------------------------
// 1. Lettura della sorgente USFM
// ---------------------------------------------------------------------------

/** Riferimento nella numerazione della sorgente, nella forma TVTMS "Gen.32:1". */
function rifSorgente(tvtms: string, cap: number, ver: number): string {
  return `${tvtms}.${cap}:${ver}`
}

interface VersettoSorgente {
  tvtms: string
  capitolo: number
  numero: number
  testo: string
}

let righeContinuazione = 0

function leggiUsfm(libro: (typeof LIBRI)[number]): VersettoSorgente[] {
  const percorso = path.join(DIR_USFM, libro.usfm)
  if (!existsSync(percorso)) {
    err(percorso, 'file USFM assente (scaricare ita1927_usfm.zip da eBible.org e scompattarlo in scripts/sources/ita1927_usfm/)')
    return []
  }
  const out: VersettoSorgente[] = []
  let capitolo = 0
  let aperto: VersettoSorgente | null = null

  for (const riga of readFileSync(percorso, 'utf8').split(/\r?\n/)) {
    const testo = riga.trim()
    if (testo === '') continue
    if (testo.startsWith('\\')) {
      const marcatore = /^\\(\S+)\s*(.*)$/.exec(testo)
      if (!marcatore) {
        err(percorso, `riga con marcatore non analizzabile: "${testo.slice(0, 60)}"`)
        continue
      }
      const [, tag, resto] = marcatore
      if (tag === 'c') {
        const n = Number(resto)
        if (!Number.isInteger(n) || n <= 0) err(percorso, `numero di capitolo non valido: "${resto}"`)
        capitolo = n
        aperto = null
      } else if (tag === 'v') {
        const m = /^(\d+)\s*(.*)$/.exec(resto)
        if (!m) {
          err(percorso, `versetto non analizzabile: "${testo.slice(0, 60)}"`)
          continue
        }
        aperto = { tvtms: libro.tvtms, capitolo, numero: Number(m[1]), testo: m[2] }
        out.push(aperto)
      } else {
        // \p e le intestazioni: struttura tipografica, non testo del versetto.
        // Non chiudono il versetto aperto (un \p a metà versetto non spezza la frase).
      }
    } else if (aperto) {
      righeContinuazione++
      aperto.testo += ` ${testo}`
    }
  }
  for (const v of out) v.testo = v.testo.replace(/\s+/g, ' ').trim()
  return out
}

const versettiSorgente: VersettoSorgente[] = []
for (const libro of LIBRI) versettiSorgente.push(...leggiUsfm(libro))

/** Inventario per valutare i Tests TVTMS: rif sorgente esistenti e ultimo versetto di ogni capitolo. */
const rifEsistenti = new Set<string>()
const ultimoDelCapitolo = new Map<string, number>()
for (const v of versettiSorgente) {
  const rif = rifSorgente(v.tvtms, v.capitolo, v.numero)
  if (rifEsistenti.has(rif)) err(rif, 'versetto duplicato nella sorgente USFM')
  rifEsistenti.add(rif)
  const chiaveCap = `${v.tvtms}.${v.capitolo}`
  ultimoDelCapitolo.set(chiaveCap, Math.max(ultimoDelCapitolo.get(chiaveCap) ?? 0, v.numero))
}

// ---------------------------------------------------------------------------
// 2. TVTMS: costruzione della mappa KJV → TM
// ---------------------------------------------------------------------------

/** "Gen.32:1" → parti, solo se è un riferimento semplice (niente "!a", ";", range). */
function analizzaRif(grezzo: string): { tvtms: string; capitolo: number; numero: number } | null {
  const m = /^([1-3]?[A-Za-z]{2,3})\.(\d+):(\d+)$/.exec(grezzo.trim())
  if (!m) return null
  return { tvtms: m[1], capitolo: Number(m[2]), numero: Number(m[3]) }
}

/**
 * Come analizzaRif, ma accetta anche i riferimenti suddivisi in parti ("Num.26:1!b"):
 * il suffisso "!x" indica una porzione di un versetto che nella Bibbia bersaglio è unico.
 * `suddiviso` dice che il versetto KJV contiene anche il testo di un altro versetto TM.
 */
function analizzaRifSuddivisibile(
  grezzo: string,
): { tvtms: string; capitolo: number; numero: number; suddiviso: boolean } | null {
  const senzaParte = grezzo.trim().replace(/![a-z]$/i, '')
  const rif = analizzaRif(senzaParte)
  if (!rif) return null
  return { ...rif, suddiviso: senzaParte !== grezzo.trim() }
}

/** Azioni TVTMS in cui il versetto della sorgente conserva un testo proprio, rinumerabile. */
const AZIONI_RINUMERABILI = new Set(['Renumber verse', 'Keep verse'])

/** Valuta i Tests di una riga TVTMS sull'inventario della sorgente. null = forma non gestita. */
function valutaTests(tests: string): boolean | null {
  const atomi = tests
    .split('&')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (atomi.length === 0) return null
  let risultato = true
  for (const atomo of atomi) {
    const m = /^(.+?)=(Exist|NotExist|Last)$/.exec(atomo)
    if (!m) return null
    const rif = analizzaRif(m[1])
    if (!rif) return null
    const chiave = rifSorgente(rif.tvtms, rif.capitolo, rif.numero)
    let vero: boolean
    if (m[2] === 'Exist') vero = rifEsistenti.has(chiave)
    else if (m[2] === 'NotExist') vero = !rifEsistenti.has(chiave)
    else vero = ultimoDelCapitolo.get(`${rif.tvtms}.${rif.capitolo}`) === rif.numero
    risultato &&= vero
  }
  return risultato
}

interface RigaTvtms {
  sourceType: string
  sourceRef: string
  standardRef: string
  action: string
  tests: string
}

function leggiTvtms(): RigaTvtms[] {
  if (!existsSync(FILE_TVTMS)) {
    err(FILE_TVTMS, 'file TVTMS assente (clonare github.com/STEPBible/STEPBible-Data in scripts/sources/)')
    return []
  }
  const righe = readFileSync(FILE_TVTMS, 'utf8').split(/\r?\n/)
  const inizio = righe.findIndex((r) => r.startsWith('#DataStart(Expanded)'))
  const fine = righe.findIndex((r) => r.startsWith('#DataEnd(Expanded)'))
  if (inizio < 0 || fine < 0 || fine <= inizio) {
    err(FILE_TVTMS, 'sezione #DataStart(Expanded)…#DataEnd(Expanded) non trovata')
    return []
  }
  const out: RigaTvtms[] = []
  for (const riga of righe.slice(inizio + 1, fine)) {
    const col = riga.split('\t')
    if (col.length < 9) continue
    const [sourceType, sourceRef, standardRef, action] = col
    if (sourceType === '' || sourceType === 'SourceType' || sourceRef === '') continue
    out.push({ sourceType, sourceRef, standardRef, action, tests: col[8] })
  }
  return out
}

/** kjv "Gen.32:1" → { id TM, riga d'origine } */
const mappaKjvVersoTm = new Map<string, { idTm: string; riga: RigaTvtms }>()
/** Versetti TM che TVTMS dichiara non separabili nella versificazione della sorgente. */
const lacune: LacunaTraduzione[] = []
const capitoliGiaTm = new Set<string>()
let righeIgnorate = 0

for (const riga of leggiTvtms()) {
  const tipi = riga.sourceType.split('+').map((s) => s.trim())
  // Le righe che elencano anche Eng-KJV descrivono un punto in cui le due tradizioni
  // coincidono: non possono generare un rimappaggio.
  if (!tipi.includes('Hebrew') || tipi.includes('Eng-KJV')) continue

  const src = analizzaRif(riga.sourceRef)
  if (!src || !CODICE_DA_TVTMS.has(src.tvtms)) continue // fuori dal Pentateuco o riferimento composto
  if (riga.sourceRef.trim() === riga.standardRef.trim()) continue

  const codice = CODICE_DA_TVTMS.get(src.tvtms)!
  const idTm = `${codice}.${src.capitolo}.${src.numero}`

  const tests = valutaTests(riga.tests)
  if (tests === null) {
    err(`TVTMS ${riga.sourceRef}`, `Tests in forma non gestita: "${riga.tests}"`)
    continue
  }
  if (tests) {
    // La sorgente segue già la numerazione ebraica qui: nessuna inversione da fare.
    capitoliGiaTm.add(`${src.tvtms}.${src.capitolo}`)
    continue
  }

  // Tests falsi: la sorgente non segue il TM. Si inverte la riga, se è invertibile.
  const std = analizzaRifSuddivisibile(riga.standardRef)
  // Non invertibile quando lo StandardRef è composto ("Num.25:19; 26:1"), oppure quando
  // è la porzione di un versetto KJV che TVTMS non considera portatrice del riferimento
  // (azioni di fusione/divisione): in entrambi i casi il versetto TM resta senza una
  // sorgente propria e il testo non è separabile senza deciderne arbitrariamente il taglio.
  if (!std || (std.suddiviso && !AZIONI_RINUMERABILI.has(riga.action.trim()))) {
    lacune.push({
      id: idTm,
      motivo: `nella versificazione della sorgente (KJV) questo versetto non è distinto: TVTMS lo dà come ${riga.sourceRef} → ${riga.standardRef.trim()} (${riga.action}). Il testo non è separabile senza deciderne arbitrariamente il taglio.`,
    })
    continue
  }
  const kjv = rifSorgente(std.tvtms, std.capitolo, std.numero)
  const precedente = mappaKjvVersoTm.get(kjv)
  if (precedente) {
    // Due righe puntano allo stesso versetto KJV: vince quella che lo conserva
    // ("Keep verse"), l'altra è una parte fusa e diventa una lacuna.
    const vincente = riga.action.trim() === 'Keep verse' ? { idTm, riga } : precedente
    const perdente = vincente === precedente ? { idTm, riga } : precedente
    if (vincente.idTm === perdente.idTm) {
      err(`TVTMS ${kjv}`, `due righe con azione "${riga.action}" puntano allo stesso versetto KJV senza un criterio per sceglierle`)
      continue
    }
    mappaKjvVersoTm.set(kjv, vincente)
    lacune.push({
      id: perdente.idTm,
      motivo: `nella versificazione della sorgente (KJV) questo versetto è fuso in ${kjv.replace(':', '.')}: TVTMS lo dà come ${perdente.riga.sourceRef} → ${perdente.riga.standardRef.trim()} (${perdente.riga.action}).`,
    })
    righeIgnorate++
    continue
  }
  mappaKjvVersoTm.set(kjv, { idTm, riga })
}

// ---------------------------------------------------------------------------
// 3. Applicazione: testi indicizzati per id TM
// ---------------------------------------------------------------------------

const testi: Record<string, string> = {}
let rimappati = 0

for (const v of versettiSorgente) {
  const rif = rifSorgente(v.tvtms, v.capitolo, v.numero)
  const codice = CODICE_DA_TVTMS.get(v.tvtms)!
  const predefinito = `${codice}.${v.capitolo}.${v.numero}`
  const idTm = mappaKjvVersoTm.get(rif)?.idTm ?? predefinito
  if (idTm !== predefinito) rimappati++
  if (v.testo === '') {
    // Versetto vuoto nella sorgente: non lo scriviamo, ma non lo passiamo sotto silenzio.
    avvisi.push(`${rif} (→ ${idTm}) è vuoto nella sorgente USFM`)
    continue
  }
  if (idTm in testi) err(idTm, `due versetti della sorgente finiscono sullo stesso id TM (ultimo: ${rif})`)
  testi[idTm] = v.testo
}

// ---------------------------------------------------------------------------
// 4. Riscontro sull'inventario TM prodotto dall'import TAHOT
// ---------------------------------------------------------------------------

const idTmEsistenti = new Set<string>()
for (const { codice } of LIBRI) {
  const percorso = path.join(DIR_VERSETTI, `${codice}.json`)
  if (!existsSync(percorso)) {
    err(percorso, 'inventario TM assente: eseguire prima scripts/import-tahot.ts')
    continue
  }
  const libro = LibroVersetti.parse(JSON.parse(readFileSync(percorso, 'utf8')))
  for (const v of libro.versetti) idTmEsistenti.add(v.id)
}

if (idTmEsistenti.size > 0) {
  for (const id of Object.keys(testi))
    if (!idTmEsistenti.has(id)) err(id, 'id TM prodotto dal rimappaggio ma inesistente nel testo ebraico')
  const idLacune = new Set(lacune.map((l) => l.id))
  const scoperti = [...idTmEsistenti].filter((id) => !(id in testi) && !idLacune.has(id))
  if (scoperti.length > 0)
    err(
      'copertura',
      `${scoperti.length} versetti TM senza testo e non giustificati da una riga TVTMS (es. ${scoperti.slice(0, 5).join(', ')})`,
    )
  for (const l of lacune)
    if (!idTmEsistenti.has(l.id)) err(l.id, 'lacuna dichiarata su un id TM inesistente')
}
for (const l of lacune)
  if (l.id in testi) err(l.id, 'dichiarato come lacuna ma il rimappaggio gli ha assegnato un testo')

// ---------------------------------------------------------------------------
// 5. Scrittura
// ---------------------------------------------------------------------------

lacune.sort((a, b) => a.id.localeCompare(b.id))
const meta = { ...META, lacune }

const file = Traduzione.parse({ meta, testi })

if (errori.length > 0) {
  console.error(`import-luzzi: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori) console.error(`  - ${e}`)
  process.exit(1)
}

mkdirSync(DIR_TRADUZIONI, { recursive: true })

// Un testo per riga: file [G] ispezionabile e diff leggibili tra rigenerazioni.
const corpo = Object.entries(file.testi)
  .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  .join(',\n')
writeFileSync(
  path.join(DIR_TRADUZIONI, 'luzzi.json'),
  `{\n${JSON.stringify('meta')}: ${JSON.stringify(file.meta)},\n${JSON.stringify('testi')}: {\n${corpo}\n}\n}\n`,
  'utf8',
)

// Manifest [C]: si aggiunge la voce se manca, senza toccare il resto.
const percorsoManifest = path.join(DIR_TRADUZIONI, 'index.json')
const manifest = existsSync(percorsoManifest)
  ? ManifestTraduzioni.parse(JSON.parse(readFileSync(percorsoManifest, 'utf8')))
  : { disponibili: [] }
let manifestAggiornato = false
if (!manifest.disponibili.includes(META.id)) {
  manifest.disponibili.push(META.id)
  writeFileSync(percorsoManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  manifestAggiornato = true
}

// ---------------------------------------------------------------------------
// 6. Riepilogo
// ---------------------------------------------------------------------------

console.log('import-luzzi: generazione completata.\n')
console.log(`  edizione:            ${META.nome}, ${META.anno} (${META.licenza})`)
console.log(`  versetti nella sorgente USFM: ${versettiSorgente.length}`)
console.log(`  versetti TM nel testo ebraico: ${idTmEsistenti.size}`)
console.log(`  testi scritti:       ${Object.keys(testi).length}`)
console.log(`\n  rimappaggio versificazione (TVTMS, direzione KJV → TM):`)
console.log(`    regole di rinumerazione applicabili: ${mappaKjvVersoTm.size}`)
console.log(`    versetti effettivamente rinumerati:  ${rimappati}`)
console.log(`    capitoli già in numerazione TM:      ${capitoliGiaTm.size}`)
console.log(`    righe scartate perché parte fusa:    ${righeIgnorate}`)
for (const l of lacune) console.log(`    lacuna dichiarata: ${l.id} — ${l.motivo}`)
if (righeContinuazione > 0) console.log(`\n  righe USFM di continuazione accodate: ${righeContinuazione}`)
if (manifestAggiornato) console.log(`\n  manifest: aggiunta la voce "${META.id}" in ${percorsoManifest}`)
else console.log(`\n  manifest: voce "${META.id}" già presente, non toccato`)
if (avvisi.length > 0) {
  console.log(`\n  avvisi (${avvisi.length}):`)
  for (const a of avvisi) console.log(`    - ${a}`)
}
