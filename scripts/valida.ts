// scripts/valida.ts — Task F0.3.
// Valida ogni JSON del dataset contro gli schemi Zod di src/tipi/ e applica i
// controlli incrociati che gli schemi, file per file, non possono esprimere:
//   - esistenza di ogni riferimento incrociato (versetti, parole, persone, luoghi, note);
//   - reciprocità delle relazioni familiari (padre/madre ↔ figli, coniugi simmetrici);
//   - copertura contigua delle pericopi sul range curato — semantica adottata: per ogni
//     libro, la collezione degli eventi definisce da sé il range curato come
//     [min range.da, max range.a] e dentro quel range deve essere una partizione
//     perfetta dei versetti: niente buchi, niente sovrapposizioni (la contiguità è
//     verificata sull'ordine dei versetti del file verses/<libro>.json);
//   - coerenza fonti ↔ da_verificare: un record senza alcuna fonte (in tutti i suoi
//     array `fonti`, anche annidati, ECCETTO composizione.nota_di_metodo.fonti, escluse
//     di proposito da SCHEMI-DATI §2.5 — v. il commento sul posto) non può avere
//     da_verificare: false;
//   - chiavi delle traduzioni risolvibili su id TM; traduzione "completa" senza buchi
//     oltre a quelli dichiarati in meta.lacune (e ogni lacuna dichiarata dev'essere reale);
//   - commentatore e sefaria_ref valorizzati solo quando tipo = "tradizione_ebraica";
//   - confidence "attribuito" ⇔ nota di tipo "tradizione_ebraica": il valore è fuori dalla
//     scala storico-critica e non può comparire su note storiche, luoghi o eventi;
//   - da ≤ a in RangeAnni e RangeVersetti (per i versetti: stesso libro, confronto
//     capitolo/versetto);
//   - coerenze interne dei file generati: id ↔ campi (versetti e parole), libro ↔ nome
//     file, flag `interno` dei crossref, dimensione degli embeddings, manifest ↔ file
//     delle traduzioni.
//
// Oltre agli errori emette AVVISI, che non fanno fallire la validazione: al momento uno
// solo, lo stesso id in file diversi della stessa collezione (tipicamente una bozza in
// bootstrap/ e il file curato in public/data/). Non è un dato invalido — durante una
// revisione le due copie coesistono per forza — ma a valle vince il file letto per primo,
// quindi va visto.
//
// Uso:  npx tsx scripts/valida.ts [directory ...]
//       Senza argomenti valida public/data e bootstrap.
// Esce con codice diverso da 0 se trova almeno un errore.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import {
  CodiceLibro,
  Embeddings,
  Evento,
  IndiceLemmi,
  LexiconIt,
  LibroCrossref,
  LibroParole,
  LibroVersetti,
  Luogo,
  ManifestTraduzioni,
  Nota,
  Persona,
  RangeAnni,
  RangeVersetti,
  Traduzione,
} from '../src/tipi/index.ts'

// ---------------------------------------------------------------------------
// Raccolta errori e avvisi
// ---------------------------------------------------------------------------

interface Errore {
  file: string
  record: string
  messaggio: string
}

const errori: Errore[] = []
const avvisi: Errore[] = []
let erroriDiSchema = 0

function err(file: string, record: string, messaggio: string): void {
  errori.push({ file, record, messaggio })
}

/** Segnalazione che non fa fallire la validazione: situazione da guardare, non dato invalido. */
function avv(file: string, record: string, messaggio: string): void {
  avvisi.push({ file, record, messaggio })
}

// Stesso id in file diversi della stessa collezione. Non è un errore — nel flusso normale
// bootstrap/ contiene bozze e public/data/ i file curati, e durante una revisione i due
// possono legittimamente coesistere — ma è ambiguo: a valle vince il primo file letto
// (per le persone lo dice esplicitamente `if (!persone.has(p.id))`), quindi una copia
// pristina dimenticata in bootstrap/ può mettere in ombra il record curato senza che nulla
// lo segnali. Da qui l'avviso, che nomina i file coinvolti.
const idPerCollezione = new Map<string, Map<string, string[]>>()

function registraId(collezione: string, id: string, file: string): void {
  let perId = idPerCollezione.get(collezione)
  if (!perId) {
    perId = new Map<string, string[]>()
    idPerCollezione.set(collezione, perId)
  }
  const files = perId.get(id)
  if (files) {
    if (!files.includes(file)) files.push(file)
  } else perId.set(id, [file])
}

function formattaPath(p: PropertyKey[]): string {
  return p.length > 0 ? `${p.map(String).join('.')}: ` : ''
}

// ---------------------------------------------------------------------------
// Utilità sugli id
// ---------------------------------------------------------------------------

const RE_VERSETTO = /^(gen|exo|lev|num|deu)\.(\d+)\.(\d+)$/

function spezzaVersetto(id: string): { libro: string; capitolo: number; versetto: number } | null {
  const m = RE_VERSETTO.exec(id)
  return m ? { libro: m[1], capitolo: Number(m[2]), versetto: Number(m[3]) } : null
}

/** Parte-versetto di un id parola ("gen.1.1.01" → "gen.1.1") e posizione numerica. */
function spezzaParola(id: string): { verso: string; pos: number } | null {
  const i = id.lastIndexOf('.')
  if (i < 0) return null
  return { verso: id.slice(0, i), pos: Number(id.slice(i + 1)) }
}

// ---------------------------------------------------------------------------
// Contesto globale (unione di tutte le directory validate in questa esecuzione)
// ---------------------------------------------------------------------------

interface OrdineLibro {
  ids: string[] // id versetto in ordine canonico (capitolo, numero)
  pos: Map<string, number>
  file: string
}

const versetti = new Set<string>()
const parole = new Set<string>()
const luoghi = new Set<string>()
const noteIds = new Set<string>()
const persone = new Map<string, { file: string; p: Persona }>()
const ordinePerLibro = new Map<string, OrdineLibro>()

const fileVersetti: { file: string; v: LibroVersetti }[] = []
const fileParole: { file: string; w: LibroParole }[] = []
const fileCrossref: { file: string; c: LibroCrossref }[] = []
const fileLemmi: { file: string; ix: IndiceLemmi }[] = []
const fileLexicon: { file: string; lx: LexiconIt }[] = []
const fileEmbeddings: { file: string; em: Embeddings }[] = []
const fileLuoghi: { file: string; record: Luogo }[] = []
const fileEventi: { file: string; e: Evento }[] = []
const fileNote: { file: string; n: Nota }[] = []
const fileTraduzioni: { file: string; root: string; stem: string; t: Traduzione }[] = []
const fileManifest: { file: string; root: string; m: ManifestTraduzioni }[] = []

// ---------------------------------------------------------------------------
// Validazione di schema (fase 1)
// ---------------------------------------------------------------------------

/** Valida un file-array record per record; restituisce i soli record validi. */
function validaCollezione<T>(file: string, grezzo: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(grezzo)) {
    erroriDiSchema++
    err(file, '(radice)', 'atteso un array di record')
    return []
  }
  const validi: T[] = []
  grezzo.forEach((el, i) => {
    const etichetta =
      el !== null && typeof el === 'object' && typeof (el as Record<string, unknown>).id === 'string'
        ? String((el as Record<string, unknown>).id)
        : `record #${i}`
    const r = schema.safeParse(el)
    if (r.success) validi.push(r.data)
    else
      for (const issue of r.error.issues) {
        erroriDiSchema++
        err(file, etichetta, `${formattaPath(issue.path)}${issue.message}`)
      }
  })
  return validi
}

/** Valida un file-oggetto intero; null se non conforme. */
function validaOggetto<T>(file: string, grezzo: unknown, schema: z.ZodType<T>): T | null {
  const r = schema.safeParse(grezzo)
  if (r.success) return r.data
  for (const issue of r.error.issues) {
    erroriDiSchema++
    err(file, '(schema)', `${formattaPath(issue.path)}${issue.message}`)
  }
  return null
}

/** Segnala gli id duplicati in una collezione; restituisce i record con id univoco (primo vince). */
function senzaDuplicati<T extends { id: string }>(file: string, records: T[]): T[] {
  const visti = new Set<string>()
  const unici: T[] = []
  for (const r of records) {
    if (visti.has(r.id)) err(file, r.id, 'id duplicato nel file')
    else {
      visti.add(r.id)
      unici.push(r)
    }
  }
  return unici
}

// ---------------------------------------------------------------------------
// Classificazione dei file per percorso
// ---------------------------------------------------------------------------

type Categoria =
  | 'verses'
  | 'words'
  | 'crossrefs'
  | 'lemmi'
  | 'manifest'
  | 'traduzione'
  | 'places'
  | 'people'
  | 'events'
  | 'notes'
  | 'lexicon'
  | 'embeddings'

/** `notes.json` oppure `notes-<qualcosa>.json`, mai `notesfoo.json`. */
function collezione(base: string, nome: string): boolean {
  return base === `${nome}.json` || (base.startsWith(`${nome}-`) && base.endsWith('.json'))
}

function classifica(relativo: string): Categoria | null {
  const base = path.posix.basename(relativo)
  const cartella = path.posix.basename(path.posix.dirname(relativo))
  if (cartella === 'verses') return 'verses'
  if (cartella === 'words') return 'words'
  if (cartella === 'crossrefs') return 'crossrefs'
  if (cartella === 'indices' && base === 'lemmi.json') return 'lemmi'
  if (cartella === 'translations') return base === 'index.json' ? 'manifest' : 'traduzione'
  // Le collezioni curate ammettono anche bozze parziali con suffisso — `notes-f23.json`,
  // `places-gen4.json` — perché la curation procede per range e una bozza va tenuta
  // separata dal file già revisionato senza per questo uscire dalla validazione. Il
  // controllo sugli id duplicati fra file (avviso K) copre il rischio che la bozza e il
  // file curato si sovrappongano.
  if (collezione(base, 'places')) return 'places'
  if (collezione(base, 'people')) return 'people'
  if (collezione(base, 'events')) return 'events'
  if (collezione(base, 'notes')) return 'notes'
  if (base === 'lexicon_it.json') return 'lexicon'
  if (base === 'embeddings.json') return 'embeddings'
  return null
}

function trovaJson(dir: string): string[] {
  const trovati: string[] = []
  for (const nome of readdirSync(dir).sort()) {
    const p = path.join(dir, nome)
    if (statSync(p).isDirectory()) trovati.push(...trovaJson(p))
    else if (nome.endsWith('.json')) trovati.push(p)
  }
  return trovati
}

// ---------------------------------------------------------------------------
// Fase 1 — caricamento, schema, coerenze interne al singolo file
// ---------------------------------------------------------------------------

const radici = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['public/data', 'bootstrap']
let fileEsaminati = 0

for (const radice of radici) {
  if (!existsSync(radice) || !statSync(radice).isDirectory()) {
    err(radice, '(directory)', 'directory inesistente o non leggibile')
    continue
  }
  for (const assoluto of trovaJson(radice)) {
    fileEsaminati++
    const file = path.relative(process.cwd(), assoluto).replaceAll('\\', '/')
    const relativo = path.relative(radice, assoluto).replaceAll('\\', '/')
    const stem = path.posix.basename(relativo, '.json')

    let grezzo: unknown
    try {
      grezzo = JSON.parse(readFileSync(assoluto, 'utf8'))
    } catch (e) {
      err(file, '(file)', `JSON non analizzabile: ${(e as Error).message}`)
      continue
    }

    const categoria = classifica(relativo)
    if (categoria === null) {
      err(file, '(file)', 'file JSON non riconosciuto: nessuno schema associato (vedi docs/SCHEMI-DATI.md §3)')
      continue
    }

    switch (categoria) {
      case 'verses': {
        const v = validaOggetto(file, grezzo, LibroVersetti)
        if (!v) break
        if (v.libro !== stem) err(file, '(file)', `campo libro "${v.libro}" non coerente col nome file "${stem}.json"`)
        if (ordinePerLibro.has(v.libro)) {
          err(file, '(file)', `libro "${v.libro}" già definito in ${ordinePerLibro.get(v.libro)!.file}: ordine dei versetti ambiguo`)
          break
        }
        const vistiId = new Set<string>()
        let maxCapitolo = 0
        for (const vs of v.versetti) {
          if (vistiId.has(vs.id)) err(file, vs.id, 'id versetto duplicato nel file')
          vistiId.add(vs.id)
          const sp = spezzaVersetto(vs.id)
          if (sp) {
            if (sp.libro !== v.libro) err(file, vs.id, `id di un altro libro ("${sp.libro}") in ${v.libro}.json`)
            if (sp.capitolo !== vs.capitolo || sp.versetto !== vs.numero)
              err(file, vs.id, `campi capitolo/numero (${vs.capitolo}/${vs.numero}) non coerenti con l'id`)
          }
          maxCapitolo = Math.max(maxCapitolo, vs.capitolo)
          for (const pid of vs.parole) {
            const sp2 = spezzaParola(pid)
            if (sp2 && sp2.verso !== vs.id) err(file, vs.id, `parola "${pid}" non appartiene a questo versetto`)
          }
          versetti.add(vs.id)
        }
        if (v.versetti.length > 0 && v.capitoli !== maxCapitolo)
          err(file, '(file)', `campo capitoli = ${v.capitoli} ma il capitolo massimo presente è ${maxCapitolo}`)
        const ordinati = [...v.versetti].sort((a, b) => a.capitolo - b.capitolo || a.numero - b.numero)
        const ids = ordinati.map((x) => x.id)
        ordinePerLibro.set(v.libro, { ids, pos: new Map(ids.map((id, i) => [id, i])), file })
        fileVersetti.push({ file, v })
        break
      }
      case 'words': {
        const w = validaOggetto(file, grezzo, LibroParole)
        if (!w) break
        const vistiId = new Set<string>()
        for (const p of w.parole) {
          if (vistiId.has(p.id)) err(file, p.id, 'id parola duplicato nel file')
          vistiId.add(p.id)
          const sp = spezzaParola(p.id)
          if (sp) {
            if (sp.verso !== p.verso) err(file, p.id, `campo verso "${p.verso}" non coerente con l'id`)
            if (sp.pos !== p.pos) err(file, p.id, `campo pos ${p.pos} non coerente con l'id (atteso ${sp.pos})`)
          }
          parole.add(p.id)
        }
        fileParole.push({ file, w })
        break
      }
      case 'crossrefs': {
        const c = validaOggetto(file, grezzo, LibroCrossref)
        if (c) fileCrossref.push({ file, c })
        break
      }
      case 'lemmi': {
        const ix = validaOggetto(file, grezzo, IndiceLemmi)
        if (ix) fileLemmi.push({ file, ix })
        break
      }
      case 'manifest': {
        const m = validaOggetto(file, grezzo, ManifestTraduzioni)
        if (m) fileManifest.push({ file, root: radice, m })
        break
      }
      case 'traduzione': {
        const t = validaOggetto(file, grezzo, Traduzione)
        if (!t) break
        if (t.meta.id !== stem) err(file, t.meta.id, `meta.id non coerente col nome file "${stem}.json"`)
        fileTraduzioni.push({ file, root: radice, stem, t })
        break
      }
      case 'places': {
        for (const record of senzaDuplicati(file, validaCollezione(file, grezzo, Luogo))) {
          registraId('places', record.id, file)
          luoghi.add(record.id)
          fileLuoghi.push({ file, record })
        }
        break
      }
      case 'people': {
        for (const p of senzaDuplicati(file, validaCollezione(file, grezzo, Persona))) {
          registraId('people', p.id, file)
          if (!persone.has(p.id)) persone.set(p.id, { file, p })
        }
        break
      }
      case 'events': {
        for (const e of senzaDuplicati(file, validaCollezione(file, grezzo, Evento))) {
          registraId('events', e.id, file)
          fileEventi.push({ file, e })
        }
        break
      }
      case 'notes': {
        for (const n of senzaDuplicati(file, validaCollezione(file, grezzo, Nota))) {
          registraId('notes', n.id, file)
          noteIds.add(n.id)
          fileNote.push({ file, n })
        }
        break
      }
      case 'lexicon': {
        const lx = validaOggetto(file, grezzo, LexiconIt)
        if (lx) fileLexicon.push({ file, lx })
        break
      }
      case 'embeddings': {
        const em = validaOggetto(file, grezzo, Embeddings)
        if (em) fileEmbeddings.push({ file, em })
        break
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — controlli incrociati (sull'unione di tutto ciò che è stato caricato)
// ---------------------------------------------------------------------------

function controllaVersettoRef(file: string, record: string, campo: string, id: string): void {
  if (!versetti.has(id)) err(file, record, `${campo}: versetto inesistente "${id}"`)
}

function controllaRangeAnni(file: string, record: string, campo: string, r: RangeAnni | null): void {
  if (r && r.da > r.a) err(file, record, `${campo}: da (${r.da}) > a (${r.a})`)
}

/** da ≤ a: stesso libro, poi confronto capitolo/versetto. Restituisce false se il range è invalido. */
function controllaRangeVersetti(file: string, record: string, campo: string, r: RangeVersetti): boolean {
  const da = spezzaVersetto(r.da)
  const a = spezzaVersetto(r.a)
  if (!da || !a) return false // già segnalato dallo schema
  if (da.libro !== a.libro) {
    err(file, record, `${campo}: range su libri diversi (${r.da} → ${r.a})`)
    return false
  }
  if (da.capitolo > a.capitolo || (da.capitolo === a.capitolo && da.versetto > a.versetto)) {
    err(file, record, `${campo}: "da" (${r.da}) successivo ad "a" (${r.a})`)
    return false
  }
  controllaVersettoRef(file, record, `${campo}.da`, r.da)
  controllaVersettoRef(file, record, `${campo}.a`, r.a)
  return true
}

function controllaFontiDaVerificare(file: string, record: string, totale: number, daVerificare: boolean): void {
  if (totale === 0 && !daVerificare)
    err(file, record, 'nessuna fonte in tutto il record ma da_verificare = false: un record senza fonti deve avere da_verificare = true')
}

/**
 * `composizione.range` contro le `datazione` delle posizioni. Il range è memorizzato,
 * non calcolato (vedi tipi/evento.ts), quindi non può essere ricavato: può però essere
 * smentito. Due controlli di peso diverso:
 * - **errore** se il range non contiene una `datazione`: il range dichiara di coprire
 *   la forbice delle posizioni, e una posizione fuori dai suoi estremi è una smentita.
 * - **avviso** se il range è più largo dell'inviluppo delle datazioni presenti: non è
 *   un dato invalido — le posizioni senza datazione possono benissimo spingere più in
 *   là — ma dice quanta parte dell'ampiezza non è ancora sostenuta da nessuna di esse.
 */
function controllaComposizione(file: string, e: Evento): void {
  const r = e.composizione.range
  const datate = e.composizione.posizioni.filter((p) => p.datazione !== null)

  e.composizione.posizioni.forEach((p, i) => {
    const d = p.datazione
    if (!d) return
    controllaRangeAnni(file, e.id, `composizione.posizioni[${i}].datazione`, d)
    if (d.da < r.da || d.a > r.a)
      err(
        file,
        e.id,
        `composizione.posizioni[${i}].datazione (${d.da}/${d.a}) non è contenuta in composizione.range (${r.da}/${r.a}): «${p.etichetta}»`,
      )
  })

  if (datate.length === 0) return
  const inviluppo = {
    da: Math.min(...datate.map((p) => p.datazione!.da)),
    a: Math.max(...datate.map((p) => p.datazione!.a)),
  }
  if (r.da < inviluppo.da || r.a > inviluppo.a)
    avv(
      file,
      e.id,
      `composizione.range (${r.da}/${r.a}) è più largo dell'inviluppo delle ${datate.length} posizioni datate (${inviluppo.da}/${inviluppo.a}): l'ampiezza in eccesso non è sostenuta da nessuna posizione`,
    )
}

// A. verses ↔ words
for (const { file, v } of fileVersetti)
  for (const vs of v.versetti)
    for (const pid of vs.parole)
      if (!parole.has(pid)) err(file, vs.id, `parola "${pid}" assente da words/`)
for (const { file, w } of fileParole)
  for (const p of w.parole)
    if (!versetti.has(p.verso)) err(file, p.id, `campo verso: versetto inesistente "${p.verso}"`)

// B. places
for (const { file, record } of fileLuoghi) {
  record.riferimenti.forEach((id, i) => controllaVersettoRef(file, record.id, `riferimenti[${i}]`, id))
  if (record.status === 'attribuito')
    err(file, record.id, 'status "attribuito": valore riservato alle note di tradizione ebraica, non ammesso sui luoghi')
  const totaleFonti = record.fonti.length + record.candidati.reduce((n, c) => n + c.fonti.length, 0)
  controllaFontiDaVerificare(file, record.id, totaleFonti, record.da_verificare)
}

// B-bis. Perimetro della curation dei luoghi (F5.x).
//
// La ricerca non mostra lo `status` dei luoghi che nessuna pericope nomina: lì
// `disputed` è il default prudente dell'import TIPNR, non un giudizio, e la vista
// dichiara invece che il luogo non è ancora entrato in curation. Quella resa si
// regge su un fatto che oggi vale senza eccezioni — fuori dal perimetro nessun
// record è verificato — e che nessuno schema impone. Questo avviso lo sorveglia:
// un luogo mai nominato con `da_verificare: false` è o una revisione fatta senza
// agganciarlo a una pericope, o una svista di curation. In entrambi i casi va
// guardato prima che la vista continui a chiamarlo «non ancora entrato».
{
  const nelPerimetro = new Set(fileEventi.flatMap(({ e }) => e.luoghi))
  for (const { file, record } of fileLuoghi)
    if (!nelPerimetro.has(record.id) && !record.da_verificare)
      avv(
        file,
        record.id,
        'luogo mai nominato da una pericope ma con da_verificare = false: fuori dal perimetro della curation, eppure dato per verificato — controllare se è una revisione non agganciata a nessuna pericope',
      )
}

// C. people: riferimenti, relazioni risolvibili e reciproche
for (const { file, p } of persone.values()) {
  p.riferimenti.forEach((id, i) => controllaVersettoRef(file, p.id, `riferimenti[${i}]`, id))
  if (p.dati_narrativi)
    p.dati_narrativi.versetti.forEach((id, i) => controllaVersettoRef(file, p.id, `dati_narrativi.versetti[${i}]`, id))
  controllaFontiDaVerificare(file, p.id, p.fonti.length, p.da_verificare)

  const risolvi = (campo: string, id: string | null): Persona | null => {
    if (id === null) return null
    const q = persone.get(id)
    if (!q) {
      err(file, p.id, `${campo}: persona inesistente "${id}"`)
      return null
    }
    return q.p
  }
  const padre = risolvi('relazioni.padre', p.relazioni.padre)
  if (padre && !padre.relazioni.figli.includes(p.id))
    err(file, p.id, `relazioni.padre: "${padre.id}" non elenca "${p.id}" tra i figli`)
  const madre = risolvi('relazioni.madre', p.relazioni.madre)
  if (madre && !madre.relazioni.figli.includes(p.id))
    err(file, p.id, `relazioni.madre: "${madre.id}" non elenca "${p.id}" tra i figli`)
  for (const idConiuge of p.relazioni.coniugi) {
    const q = risolvi('relazioni.coniugi', idConiuge)
    if (q && !q.relazioni.coniugi.includes(p.id))
      err(file, p.id, `relazioni.coniugi: "${q.id}" non elenca "${p.id}" tra i coniugi`)
  }
  for (const idFiglio of p.relazioni.figli) {
    const q = risolvi('relazioni.figli', idFiglio)
    if (q && q.relazioni.padre !== p.id && q.relazioni.madre !== p.id)
      err(file, p.id, `relazioni.figli: "${q.id}" non ha "${p.id}" come padre o madre`)
  }
}

// D. events: riferimenti, range, copertura contigua delle pericopi
interface EventoPosizionato {
  file: string
  e: Evento
  daPos: number
  aPos: number
}
const eventiPerLibro = new Map<string, EventoPosizionato[]>()

for (const { file, e } of fileEventi) {
  e.persone.forEach((id, i) => {
    if (!persone.has(id)) err(file, e.id, `persone[${i}]: persona inesistente "${id}"`)
  })
  e.luoghi.forEach((id, i) => {
    if (!luoghi.has(id)) err(file, e.id, `luoghi[${i}]: luogo inesistente "${id}"`)
  })
  e.tempo_narrato.riferimenti_interni.forEach((id, i) =>
    controllaVersettoRef(file, e.id, `tempo_narrato.riferimenti_interni[${i}]`, id),
  )
  controllaRangeAnni(file, e.id, 'tempo_narrato.am', e.tempo_narrato.am)
  controllaRangeAnni(file, e.id, 'tempo_storico.ancoraggio', e.tempo_storico.ancoraggio)
  controllaRangeAnni(file, e.id, 'composizione.range', e.composizione.range)
  controllaComposizione(file, e)
  if (e.tempo_storico.confidence === 'attribuito')
    err(file, e.id, 'tempo_storico.confidence "attribuito": valore riservato alle note di tradizione ebraica')
  // Le fonti di composizione.nota_di_metodo sono deliberatamente escluse: la nota è una
  // scelta editoriale del progetto, non un claim di merito, e non può soddisfare al posto
  // di una posizione il requisito di fonti del record. Vedi il commento in tipi/evento.ts.
  const totaleFonti =
    e.fonti.length + e.tempo_storico.fonti.length + e.composizione.posizioni.reduce((n, p) => n + p.fonti.length, 0)
  controllaFontiDaVerificare(file, e.id, totaleFonti, e.da_verificare)

  if (!controllaRangeVersetti(file, e.id, 'range', e.range)) continue
  const libro = spezzaVersetto(e.range.da)!.libro
  const ordine = ordinePerLibro.get(libro)
  if (!ordine) {
    err(file, e.id, `copertura pericopi non verificabile: nessun verses/${libro}.json caricato`)
    continue
  }
  const daPos = ordine.pos.get(e.range.da)
  const aPos = ordine.pos.get(e.range.a)
  if (daPos === undefined || aPos === undefined) continue // esistenza già segnalata
  const lista = eventiPerLibro.get(libro) ?? []
  lista.push({ file, e, daPos, aPos })
  eventiPerLibro.set(libro, lista)
}

// Semantica della copertura: il range curato di un libro è [min da, max a] dichiarato
// dagli eventi stessi; al suo interno la segmentazione deve essere una partizione
// perfetta (eventi adiacenti nell'ordine dei versetti, senza buchi né sovrapposizioni).
for (const [libro, lista] of eventiPerLibro) {
  lista.sort((x, y) => x.daPos - y.daPos || x.aPos - y.aPos)
  const ordine = ordinePerLibro.get(libro)!
  for (let i = 1; i < lista.length; i++) {
    const prec = lista[i - 1]
    const cur = lista[i]
    if (cur.daPos <= prec.aPos)
      err(cur.file, cur.e.id, `sovrapposizione di pericopi con "${prec.e.id}" (inizia a ${cur.e.range.da}, ma "${prec.e.id}" arriva a ${prec.e.range.a})`)
    else if (cur.daPos > prec.aPos + 1) {
      const scoperti = cur.daPos - prec.aPos - 1
      err(cur.file, cur.e.id, `buco nella copertura delle pericopi tra "${prec.e.id}" (fino a ${prec.e.range.a}) e "${cur.e.id}" (da ${cur.e.range.da}): ${scoperti === 1 ? '1 versetto scoperto' : `${scoperti} versetti scoperti`} a partire da ${ordine.ids[prec.aPos + 1]}`)
    }
  }
}

// E. notes: target, regola commentatore/sefaria_ref, fonti
for (const { file, n } of fileNote) {
  switch (n.target.tipo) {
    case 'versetto':
      controllaVersettoRef(file, n.id, 'target.ref', n.target.ref)
      break
    case 'parola':
      if (!parole.has(n.target.ref)) err(file, n.id, `target.ref: parola inesistente "${n.target.ref}"`)
      break
    case 'luogo':
      if (!luoghi.has(n.target.ref)) err(file, n.id, `target.ref: luogo inesistente "${n.target.ref}"`)
      break
    case 'persona':
      if (!persone.has(n.target.ref)) err(file, n.id, `target.ref: persona inesistente "${n.target.ref}"`)
      break
    case 'pericope':
      controllaRangeVersetti(file, n.id, 'target.ref', n.target.ref)
      break
  }
  if (n.tipo !== 'tradizione_ebraica') {
    if (n.commentatore !== null)
      err(file, n.id, `commentatore valorizzato ma tipo = "${n.tipo}": ammesso solo per tradizione_ebraica`)
    if (n.sefaria_ref !== null)
      err(file, n.id, `sefaria_ref valorizzato ma tipo = "${n.tipo}": ammesso solo per tradizione_ebraica`)
    if (n.confidence === 'attribuito')
      err(file, n.id, `confidence "attribuito" ma tipo = "${n.tipo}": ammesso solo per tradizione_ebraica`)
  } else if (n.confidence !== 'attribuito') {
    // La scala storico-critica misura il consenso; su una lettura della tradizione la
    // domanda è un'altra (chi la dice), e mescolarle è il modo più rapido per far
    // leggere un commento rabbinico come una posizione accademica minoritaria.
    err(file, n.id, `confidence "${n.confidence}" su una nota tradizione_ebraica: atteso "attribuito"`)
  }
  controllaFontiDaVerificare(file, n.id, n.fonti.length, n.da_verificare)
}

// F. translations: chiavi risolvibili, completezza, manifest ↔ file
for (const { file, t } of fileTraduzioni) {
  for (const chiave of Object.keys(t.testi))
    if (!versetti.has(chiave)) err(file, t.meta.id, `chiave non risolvibile su id TM: "${chiave}"`)
  const lacune = new Set((t.meta.lacune ?? []).map((l) => l.id))
  if (t.meta.completa && versetti.size > 0) {
    // Un buco è accettabile solo se dichiarato: così una perdita accidentale di
    // versetti nel rimappaggio della versificazione resta un errore rosso.
    const mancanti = [...versetti].filter((id) => !(id in t.testi) && !lacune.has(id))
    if (mancanti.length > 0)
      err(file, t.meta.id, `dichiarata "completa" ma mancano ${mancanti.length} versetti TM non dichiarati in meta.lacune (es. ${mancanti.slice(0, 3).join(', ')})`)
  }
  // Simmetrico: una lacuna dichiarata ma coperta dal testo è una dichiarazione stantia.
  for (const id of lacune) {
    if (id in t.testi) err(file, t.meta.id, `lacuna dichiarata ma il versetto ha testo: "${id}"`)
    else if (versetti.size > 0 && !versetti.has(id)) err(file, t.meta.id, `lacuna dichiarata su un id TM inesistente: "${id}"`)
  }
  if (!t.meta.completa && lacune.size > 0)
    err(file, t.meta.id, 'meta.lacune ha senso solo con completa: true')
}
for (const radice of radici) {
  const manifesti = fileManifest.filter((x) => x.root === radice)
  const traduzioni = fileTraduzioni.filter((x) => x.root === radice)
  if (manifesti.length === 0) {
    if (traduzioni.length > 0)
      err(traduzioni[0].file, '(manifest)', `traduzioni presenti ma translations/index.json assente in ${radice}`)
    continue
  }
  for (const { file, m } of manifesti) {
    for (const id of m.disponibili)
      if (!traduzioni.some((x) => x.stem === id))
        err(file, id, `traduzione dichiarata nel manifest ma translations/${id}.json assente`)
    for (const x of traduzioni)
      if (!m.disponibili.includes(x.stem)) err(x.file, x.stem, 'traduzione presente ma non elencata nel manifest')
  }
}

// G. indices/lemmi.json: occorrenze esistenti
for (const { file, ix } of fileLemmi)
  for (const [chiave, voce] of Object.entries(ix.lemmi))
    voce.occorrenze.forEach((id, i) => {
      if (!parole.has(id)) err(file, chiave, `occorrenze[${i}]: parola inesistente "${id}"`)
    })

// H. lexicon_it.json: coerenza fonti ↔ da_verificare per voce
for (const { file, lx } of fileLexicon)
  for (const [chiave, voce] of Object.entries(lx))
    controllaFontiDaVerificare(file, chiave, voce.fonti.length, voce.da_verificare)

// I. embeddings: dimensione e riferimenti
for (const { file, em } of fileEmbeddings)
  em.voci.forEach((voce, i) => {
    const etichetta = `voci[${i}] (${voce.tipo} ${voce.ref})`
    if (voce.v.length !== em.meta.dim)
      err(file, etichetta, `vettore di dimensione ${voce.v.length}, attesa ${em.meta.dim} (meta.dim)`)
    if (voce.tipo === 'versetto' && !versetti.has(voce.ref)) err(file, etichetta, `versetto inesistente "${voce.ref}"`)
    if (voce.tipo === 'nota' && !noteIds.has(voce.ref)) err(file, etichetta, `nota inesistente "${voce.ref}"`)
  })

// J. crossrefs: origine esistente, coerenza del flag interno
const codiciPentateuco: readonly string[] = CodiceLibro.options
for (const { file, c } of fileCrossref)
  c.riferimenti.forEach((r, i) => {
    const etichetta = `riferimenti[${i}] (${r.da} → ${r.a})`
    controllaVersettoRef(file, etichetta, 'da', r.da)
    const libroDest = r.a.split('.')[0]
    const nelPentateuco = codiciPentateuco.includes(libroDest)
    if (r.interno !== nelPentateuco)
      err(file, etichetta, `flag interno = ${r.interno} incoerente: la destinazione "${r.a}" ${nelPentateuco ? 'è' : 'non è'} nel Pentateuco`)
    if (r.interno && nelPentateuco && !versetti.has(r.a)) err(file, etichetta, `destinazione interna inesistente: "${r.a}"`)
  })

// K. stesso id in file diversi della stessa collezione (avviso, non errore)
// Si raggruppa per combinazione di file invece di emettere un avviso per id: fra una bozza
// e il corrispondente file curato la sovrapposizione è tipicamente totale, e 244 righe
// identiche nasconderebbero il punto invece di mostrarlo.
for (const [collezione, perId] of idPerCollezione) {
  const perCombinazione = new Map<string, string[]>()
  for (const [id, files] of perId) {
    if (files.length < 2) continue
    const chiave = [...files].sort().join(' + ')
    const lista = perCombinazione.get(chiave) ?? []
    lista.push(id)
    perCombinazione.set(chiave, lista)
  }
  for (const [chiave, ids] of perCombinazione) {
    const esempi = ids.slice(0, 5).join(', ')
    avv(
      chiave,
      `(${collezione})`,
      `${ids.length} id presenti in più file della stessa collezione (${esempi}${ids.length > 5 ? `, … +${ids.length - 5}` : ''}): ` +
        'a valle vince il file letto per primo, quindi una copia pristina in bootstrap/ può mettere in ombra il record curato di public/data/',
    )
  }
}

// ---------------------------------------------------------------------------
// Esito
// ---------------------------------------------------------------------------

console.log(`valida: ${fileEsaminati} file JSON esaminati in ${radici.join(', ')}`)

if (avvisi.length > 0) {
  console.warn(`\nAVVISI (${avvisi.length}) — non bloccanti:`)
  for (const a of avvisi) console.warn(`  ${a.file} ${a.record} — ${a.messaggio}`)
}

if (errori.length === 0) {
  console.log(avvisi.length > 0 ? `OK — nessun errore (${avvisi.length} avvisi non bloccanti).` : 'OK — nessun errore.')
  process.exit(0)
}

const perFile = new Map<string, Errore[]>()
for (const e of errori) {
  const lista = perFile.get(e.file) ?? []
  lista.push(e)
  perFile.set(e.file, lista)
}
for (const [file, lista] of perFile) {
  console.error(`\n${file}`)
  for (const e of lista) console.error(`  - ${e.record} — ${e.messaggio}`)
}
if (erroriDiSchema > 0)
  console.error('\nnota: in presenza di errori di schema, parte degli errori incrociati può essere derivata (i record non validi sono esclusi dal contesto).')
console.error(`\nERRORI: ${errori.length} in ${perFile.size} file.`)
process.exit(1)
