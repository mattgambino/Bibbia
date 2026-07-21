// scripts/import-tipnr.ts — Task F1.3.
// Genera le BOZZE bootstrap/places.json e bootstrap/people.json a partire da:
//   - TIPNR (STEPBible-Data/Proper Nouns/), per entità, nomi ebraici e riferimenti;
//   - OpenBible.info Bible Geocoding (Bible-Geocoding-Data-main/), per i candidati
//     di localizzazione e il loro punteggio di confidenza.
// Entrambe le sorgenti stanno in scripts/sources/ (in .gitignore).
//
// I file prodotti sono [C] in bozza: si fermano in bootstrap/ e vanno in
// public/data/ solo dopo revisione umana (SCHEMI-DATI.md §1, CLAUDE.md regola 3).
// Tutto esce con da_verificare: true e status "disputed": nessuna identificazione,
// datazione o attribuzione è affermata da questo script.
//
// AMBITO
// ------
// Tutte e sole le entità TIPNR con almeno un riferimento nel Pentateuco (dopo
// esclusione dei ref LXX). Le altre si scartano.
//
// MAPPING TIPNR → CAMPI NOSTRI (SCHEMI-DATI.md §2.3–2.4)
// -----------------------------------------------------
// Il file TIPNR è a record separati da righe "$========== PERSON(s)|PLACE|OTHER".
// La prima riga del record è la riga-testa (colonne TSV); le righe successive che
// iniziano con "– " sono sub-record (una per forma del nome), tranne "– Total"
// che aggrega e abbrevia i riferimenti e quindi NON si usa.
//
// Riga-testa PERSON:  0 UnifiedName=uStrong · 1 Description · 2 Parents ("Padre + Madre")
//                     3 Siblings · 4 Partners · 5 Offspring · 6 Tribe/Nation
//                     7 #Summary · 8 Type (Male|Female|Group|…)
// Riga-testa PLACE:   0 UniqueName=uStrong · 1 OpenBible name · 2 Founder
//                     3 People living there · 4 GoogleMap URL · 5 Palopenmaps URL
//                     6 Geographical area · 7 #Summary · 8 Type
// Sub-record:         0 Significance · 1 UniqueName · 2 dStrong«eStrong=Heb/Grk
//                     3 Translated name · 4 link STEPBible · 5 All Refs
//
// - id            → slug del nome inglese ESV (la parte prima di "@" in UnifiedName).
//                   Sugli omonimi: l'entità con l'ancora canonicamente più antica
//                   tiene lo slug nudo, le altre prendono il disambiguatore
//                   libro+capitolo della propria ancora (Hebron@1Ch.2.42 → hebron.1ch2).
// - tipnr_id      → UnifiedName completo, com'è nella sorgente (il legame col dataset
//                   non si perde anche se lo slug viene ritoccato in revisione).
// - nomi.he       → ebraico della colonna dStrong«eStrong del sub-record il cui
//                   dStrong coincide con lo uStrong della riga-testa (è per
//                   definizione la forma più comune del nome); in mancanza, il primo
//                   sub-record ebraico. I nomi composti ("H0059H«…=אָבֵל+H1038«…=בֵּית מַעֲכָה")
//                   si ricompongono unendo i pezzi con uno spazio. I sub-record greci
//                   (G…) non concorrono.
// - nomi.translit → traslitterazione STEPBible presa da indices/lemmi.json sullo
//                   stesso dStrong. Se il dStrong non è nell'indice: "" (mai inventata).
// - nomi.it       → "" per costruzione: il nome italiano è curation dell'utente.
// - riferimenti   → unione dei ref di tutti i sub-record (non "– Total"), rimappati
//                   ENG→TM, filtrati sul Pentateuco, verificati contro verses/.
//
// I campi @Brief / @Short / @Article NON si importano: l'intestazione di TIPNR li
// dichiara "Adapted from the output by Claude 3 Opus AI in April 2024", quindi non
// sono né fonte né contenuto curabile (CLAUDE.md regola 2).
//
// RIFERIMENTI: VERSIFICAZIONE INGLESE → TM
// ----------------------------------------
// TIPNR usa la versificazione inglese. Il rimappaggio si ricava dal file TAHOT
// stesso, che nella prima colonna porta le coppie "Eng.cap.ver(Heb.cap.ver)" dove
// le due tradizioni divergono: si costruisce la tabella Eng→TM da lì (non serve
// TVTMS per questo). Dove TAHOT non dichiara una coppia, ENG e TM coincidono.
// Sui singoli ref: le lettere di sottoversetto (Gen.17.23a) si tolgono, i ref
// marcati "LXX." si escludono, i ref fuori dal Pentateuco si scartano. Ogni
// riferimento prodotto deve esistere in public/data/verses/: se non esiste è un
// errore e non si scrive nulla.
//
// LUOGHI: CANDIDATI E peso_openbible
// ----------------------------------
// Il join con OpenBible è esatto, non per nome: ancient.jsonl porta linked_data
// con la chiave della fonte "tipnr" (id s3b25cf in source.jsonl), il cui valore è
// l'UniqueName TIPNR senza suffisso di libro e senza Strong ("Hebron@Gen.13.18").
// Fallback per i luoghi non agganciati così: url_slug ↔ colonna "OpenBible name".
//
// Ogni identificazione OpenBible con coordinate diventa un candidato che porta il
// proprio peso; la coordinata dell'URL Google Maps di TIPNR entra come candidato
// aggiuntivo solo quando non coincide con nessuno di essi (tolleranza 0,05° ≈ 5 km,
// decisa in sessione), e in quel caso senza peso: TIPNR dichiara coordinate
// "based on geoposition as defined by OpenBible" ma da uno snapshot precedente, e
// su 212 luoghi confrontabili solo 73 cadono entro ~2 km dalla risoluzione votata.
// Attribuire il peso per prossimità sarebbe un'inferenza, non un dato.
//
// peso_openbible = clamp(score.time_total, 0, 1000) / 1000, a 3 decimali.
// `time_total` è documentato dal readme OpenBible come intero su base 1000 che
// "reflects the confidence of current scholarship" ed è il valore con cui il
// dataset stesso ordina le identificazioni. Il range reale osservato sui nostri
// luoghi è però −419…1020 (negativo = identificazione confutata dalle fonti;
// >1000 = artefatto di arrotondamento), mentre lo schema vuole 0–1: da qui il
// clamp, deciso in sessione e non applicato in silenzio.
// Le risoluzioni "special" (unknown_place, nonspecific_place, not_a_place…) non
// hanno coordinate e non producono candidati: sono conteggiate nel riepilogo.
//
// PERSONE: RELAZIONI RECIPROCHE PER COSTRUZIONE
// --------------------------------------------
// Le colonne Parents ("Padre + Madre"), Partners e Offspring si leggono tutte e
// tre e confluiscono in un grafo di archi genitore→figlio e coniuge↔coniuge;
// `relazioni` viene poi materializzato DAL grafo, così padre/madre/figli/coniugi
// sono reciproci per costruzione e non per controllo a posteriori (il validatore
// pretende reciprocità piena). Si tengono solo gli archi fra entità entrambe
// presenti nell'output; gli scarti sono conteggiati per motivo nel riepilogo.
// I marcatori TIPNR sui nomi: "(?)" (decisione su un'ambiguità) si toglie e
// l'arco si tiene; "(a)" (antenato, non genitore effettivo) e "(d)" (capostipite
// di un gruppo/nazione) NON sono legami di parentela diretta e si scartano.
// dati_narrativi = null ovunque: TIPNR non dà le età, e ricavarle a memoria dal
// testo è escluso (CLAUDE.md regola 1).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  Luogo,
  Persona,
  type CandidatoLuogo,
  type Fonte,
  type Relazioni,
} from '../src/tipi/index.ts'

// ---------------------------------------------------------------------------
// Sorgenti e costanti
// ---------------------------------------------------------------------------

const SORGENTE_TIPNR = path.join(
  'scripts',
  'sources',
  'STEPBible-Data',
  'Proper Nouns',
  'TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt',
)
const SORGENTE_TAHOT = path.join(
  'scripts',
  'sources',
  'STEPBible-Data',
  'Translators Amalgamated OT+NT',
  'TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
)
const SORGENTE_OPENBIBLE = path.join('scripts', 'sources', 'Bible-Geocoding-Data-main', 'data', 'ancient.jsonl')
const INDICE_LEMMI = path.join('public', 'data', 'indices', 'lemmi.json')
const DIR_VERSETTI = path.join('public', 'data', 'verses')

/** Codici libro TIPNR/TAHOT → codici nostri. Ordine = ordine canonico. */
const LIBRI: Record<string, string> = { Gen: 'gen', Exo: 'exo', Lev: 'lev', Num: 'num', Deu: 'deu' }
const ORDINE_LIBRI = Object.values(LIBRI)

/** Id della fonte "tipnr" in source.jsonl di OpenBible (verificato sulla sorgente). */
const CHIAVE_TIPNR_IN_OPENBIBLE = 's3b25cf'

/** Tolleranza di fusione fra coordinata TIPNR e risoluzione OpenBible, in gradi (≈5 km). */
const TOLLERANZA_GRADI = 0.05

/** status di partenza uniforme: la scala critica si assegna in revisione, non qui. */
const STATUS_DI_PARTENZA = 'disputed' as const

const FONTE_TIPNR: Fonte = {
  tipo: 'dataset',
  titolo: 'STEPBible TIPNR (Translators Individualised Proper Names with all References), Tyndale House Cambridge',
  url: 'https://github.com/STEPBible/STEPBible-Data',
  dettaglio: 'CC BY 4.0',
}
const FONTE_OPENBIBLE: Fonte = {
  tipo: 'dataset',
  titolo: 'OpenBible.info Bible Geocoding',
  url: 'https://www.openbible.info/geo/',
  dettaglio: 'CC BY 4.0; punteggio score.time_total di ancient.jsonl',
}

// ---------------------------------------------------------------------------
// Errori: si raccolgono tutti e non si scrive nulla se ce n'è almeno uno.
// ---------------------------------------------------------------------------

const errori: string[] = []

function err(rif: string, messaggio: string): void {
  errori.push(`${rif} — ${messaggio}`)
}

function leggiObbligatorio(percorso: string, cosa: string): string {
  if (!existsSync(percorso)) {
    console.error(`Sorgente non trovata: ${percorso}`)
    console.error(cosa)
    process.exit(1)
  }
  return readFileSync(percorso, 'utf8')
}

// ---------------------------------------------------------------------------
// Riferimenti: tabella ENG→TM da TAHOT, insieme dei versetti esistenti
// ---------------------------------------------------------------------------

/** "Gen.31.55" → "gen.32.1", solo dove TAHOT dichiara la coppia Eng(Heb). */
function costruisciMappaEngTm(testoTahot: string): Map<string, string> {
  const mappa = new Map<string, string>()
  const re = /^(Gen|Exo|Lev|Num|Deu)\.(\d+)\.(\d+)\((\d+)\.(\d+)\)#/
  for (const riga of testoTahot.split(/\r?\n/)) {
    if (!/^(Gen|Exo|Lev|Num|Deu)\.\d/.test(riga)) continue
    const m = re.exec(riga.split('\t')[0])
    if (!m) continue
    mappa.set(`${m[1]}.${m[2]}.${m[3]}`, `${LIBRI[m[1]]}.${m[4]}.${m[5]}`)
  }
  return mappa
}

function caricaVersettiEsistenti(): Set<string> {
  const ids = new Set<string>()
  for (const codice of ORDINE_LIBRI) {
    const p = path.join(DIR_VERSETTI, `${codice}.json`)
    if (!existsSync(p)) {
      console.error(`File dei versetti mancante: ${p}`)
      console.error('Eseguire prima `npx tsx scripts/import-tahot.ts` (task F1.1).')
      process.exit(1)
    }
    const contenuto = JSON.parse(readFileSync(p, 'utf8')) as { versetti: { id: string }[] }
    for (const v of contenuto.versetti) ids.add(v.id)
  }
  return ids
}

const mappaEngTm = costruisciMappaEngTm(
  leggiObbligatorio(SORGENTE_TAHOT, 'Clonare github.com/STEPBible/STEPBible-Data in scripts/sources/.'),
)
const versettiEsistenti = caricaVersettiEsistenti()

interface EsitoRiferimenti {
  ids: string[]
  scartatiLxx: number
  scartatiFuoriPentateuco: number
}

/** Posizione canonica di un id versetto, per ordinare (libro, capitolo, versetto). */
function chiaveOrdine(id: string): [number, number, number] {
  const [libro, cap, ver] = id.split('.')
  return [ORDINE_LIBRI.indexOf(libro), Number(cap), Number(ver)]
}

function confrontaVersetti(a: string, b: string): number {
  const ka = chiaveOrdine(a)
  const kb = chiaveOrdine(b)
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
}

/**
 * Colonna "All Refs" di uno o più sub-record → id versetto TM del Pentateuco.
 * Forme ammesse: "Gen.4.8", "Gen.17.23a" (lettera di sottoversetto), "LXX.Gen.1.1"
 * (escluso), più i libri fuori dal Pentateuco (scartati) e i marcatori "(?)".
 */
function estraiRiferimenti(colonne: string[], rif: string): EsitoRiferimenti {
  const ids = new Set<string>()
  let scartatiLxx = 0
  let scartatiFuoriPentateuco = 0

  for (const colonna of colonne) {
    for (const grezzo of colonna.split(';')) {
      // Le parentesi quadre ([Gen.30.1]) non sono documentate nell'intestazione di
      // TIPNR e ricorrono 2 volte in tutto il file: si tolgono e il ref si tiene.
      const token = grezzo.replace('(?)', '').replace(/[[\]]/g, '').trim()
      if (token === '') continue
      if (token.startsWith('LXX')) {
        scartatiLxx++
        continue
      }
      // Un solo caso nel file ("Num.13.8,16"): la lista di versetti nello stesso capitolo.
      const [primo, ...altri] = token.split(',')
      const m = /^([A-Za-z0-9]{3})\.(\d+)\.(\d+)[a-z]?$/.exec(primo.trim())
      if (!m) {
        err(rif, `riferimento non analizzabile: "${token}"`)
        continue
      }
      const codice = LIBRI[m[1]]
      if (codice === undefined) {
        scartatiFuoriPentateuco++
        continue
      }
      for (const versetto of [m[3], ...altri.map((a) => a.trim().replace(/[a-z]$/, ''))]) {
        if (!/^\d+$/.test(versetto)) {
          err(rif, `riferimento non analizzabile: "${token}"`)
          continue
        }
        const eng = `${m[1]}.${m[2]}.${versetto}`
        ids.add(mappaEngTm.get(eng) ?? `${codice}.${m[2]}.${versetto}`)
      }
    }
  }
  return { ids: [...ids].sort(confrontaVersetti), scartatiLxx, scartatiFuoriPentateuco }
}

// ---------------------------------------------------------------------------
// Parsing di TIPNR
// ---------------------------------------------------------------------------

type TipoRecord = 'PERSON' | 'PLACE' | 'OTHER'

interface RecordTipnr {
  tipo: TipoRecord
  /** Colonne della riga-testa. */
  testa: string[]
  /** Colonne dei sub-record "– …", escluso "– Total". */
  sub: string[][]
}

let blocchiNonDati = 0

function analizzaTipnr(testo: string): RecordTipnr[] {
  const pezzi = testo.split(/\$=+ ?(PERSON\(s\)|PLACE|OTHER)[^\n]*\n/)
  const records: RecordTipnr[] = []
  for (let i = 1; i < pezzi.length; i += 2) {
    const tipo: TipoRecord = pezzi[i].startsWith('PERSON') ? 'PERSON' : (pezzi[i] as TipoRecord)
    const righe = pezzi[i + 1].split(/\r?\n/)
    const testa = righe[0].split('\t')
    // L'intestazione del file ripete gli stessi separatori per documentare le colonne
    // ("UnifiedName=uStrong\tDescription\t…"): quei blocchi non hanno "@" e non sono dati.
    if (!(testa[0] ?? '').includes('@')) {
      blocchiNonDati++
      continue
    }
    const sub: string[][] = []
    for (const riga of righe.slice(1)) {
      if (!riga.startsWith('– ') || riga.startsWith('– Total')) continue
      sub.push(riga.split('\t'))
    }
    records.push({ tipo, testa, sub })
  }
  return records
}

/** Nelle colonne TIPNR il carattere ">" fa da riempitivo di cella vuota. */
function cella(colonne: string[], i: number): string {
  const v = (colonne[i] ?? '').trim()
  return v === '>' ? '' : v
}

/** "Aaron@Exo.4.14-Heb=H0175" → { nome: "Aaron", ancora: "Exo.4.14", uStrong: "H0175" }. */
interface NomeUnificato {
  completo: string
  nome: string
  ancora: string
  uStrong: string
}

function analizzaNomeUnificato(grezzo: string): NomeUnificato | null {
  const completo = grezzo.trim()
  const i = completo.lastIndexOf('=')
  const senzaStrong = i > 0 ? completo.slice(0, i) : completo
  const uStrong = i > 0 ? completo.slice(i + 1) : ''
  const j = senzaStrong.indexOf('@')
  if (j < 0) return null
  return {
    completo,
    nome: senzaStrong.slice(0, j),
    // Via il suffisso "-Libro" (o il trattino nudo) che indica occorrenze successive.
    ancora: senzaStrong.slice(j + 1).replace(/-[A-Za-z0-9]*$/, ''),
    uStrong,
  }
}

/** Slug ASCII minuscolo conforme a SlugId (comune.ts). */
function slugifica(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "Exo.4.14" → "exo4": disambiguatore libro+capitolo dell'ancora. */
function disambiguatore(ancora: string): string {
  const m = /^([A-Za-z0-9]+)\.(\d+)\./.exec(ancora)
  return m ? slugifica(`${m[1]}${m[2]}`) : ''
}

/**
 * Ebraico della colonna "dStrong«eStrong=Heb/Grk", con il dStrong corrispondente.
 * I nomi composti ("H0059H«…=אָבֵל+H1038«…=בֵּית מַעֲכָה") si ricompongono con uno spazio.
 * Restituisce null per i sub-record greci o non analizzabili.
 */
function analizzaFormaEbraica(colonna: string): { dStrong: string; he: string } | null {
  const pezzi = colonna.trim().split('+')
  const dStrong: string[] = []
  const he: string[] = []
  for (const pezzo of pezzi) {
    const m = /^(H\d{4}[A-Za-z]?)«[^=]*=(.+)$/.exec(pezzo.trim())
    if (!m) return null
    dStrong.push(m[1])
    he.push(m[2].trim())
  }
  return dStrong.length > 0 ? { dStrong: dStrong[0], he: he.join(' ') } : null
}

// ---------------------------------------------------------------------------
// Selezione delle entità del Pentateuco
// ---------------------------------------------------------------------------

const traslitPerDStrong: Record<string, string> = (() => {
  if (!existsSync(INDICE_LEMMI)) {
    console.error(`Indice lemmi mancante: ${INDICE_LEMMI}`)
    console.error('Eseguire prima `npx tsx scripts/import-tahot.ts` (task F1.2).')
    process.exit(1)
  }
  const ix = JSON.parse(readFileSync(INDICE_LEMMI, 'utf8')) as { lemmi: Record<string, { translit: string }> }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(ix.lemmi)) out[k] = v.translit
  return out
})()

interface Entita {
  rec: RecordTipnr
  nome: NomeUnificato
  riferimenti: string[]
  he: string
  translit: string
  /** Assegnato dopo la risoluzione degli omonimi. */
  id: string
}

let scartatiLxxTotali = 0
let scartatiFuoriPentateucoTotali = 0
let senzaFormaEbraica = 0
let dStrongFuoriIndice = 0

function costruisciEntita(rec: RecordTipnr): Entita | null {
  const nome = analizzaNomeUnificato(rec.testa[0] ?? '')
  if (nome === null) {
    err(rec.testa[0] ?? '(riga-testa vuota)', 'UnifiedName non analizzabile')
    return null
  }
  const esito = estraiRiferimenti(
    rec.sub.map((s) => s[5] ?? ''),
    nome.completo,
  )
  if (esito.ids.length === 0) return null // nessun riferimento nel Pentateuco: fuori ambito

  scartatiLxxTotali += esito.scartatiLxx
  scartatiFuoriPentateucoTotali += esito.scartatiFuoriPentateuco

  // nomi.he: il sub-record il cui dStrong coincide con lo uStrong della riga-testa.
  const forme = rec.sub.map((s) => analizzaFormaEbraica(s[2] ?? '')).filter((f) => f !== null)
  const forma = forme.find((f) => f.dStrong === nome.uStrong) ?? forme[0]
  if (forma === undefined) senzaFormaEbraica++
  const translit = forma ? (traslitPerDStrong[forma.dStrong] ?? '') : ''
  if (forma && translit === '') dStrongFuoriIndice++

  return {
    rec,
    nome,
    riferimenti: esito.ids,
    he: forma?.he ?? '',
    translit,
    id: '', // assegnato da assegnaId
  }
}

/**
 * Slug definitivi: sugli omonimi l'entità con l'ancora canonicamente più antica
 * tiene lo slug nudo, le altre prendono il disambiguatore libro+capitolo.
 * Le collisioni si risolvono dentro il singolo file (luoghi e persone sono
 * namespace distinti nel validatore).
 */
function assegnaId(entita: Entita[], etichettaFile: string): string[] {
  const perSlug = new Map<string, Entita[]>()
  for (const e of entita) {
    const base = slugifica(e.nome.nome)
    if (base === '') {
      err(e.nome.completo, 'nome ESV non riducibile a slug')
      continue
    }
    const lista = perSlug.get(base) ?? []
    lista.push(e)
    perSlug.set(base, lista)
  }

  const disambiguati: string[] = []
  const usati = new Set<string>()
  for (const [base, lista] of perSlug) {
    if (lista.length === 1) {
      lista[0].id = base
      usati.add(base)
      continue
    }
    // Ordine canonico dell'ancora: il primo tiene lo slug nudo.
    lista.sort((a, b) => {
      const ra = estraiRiferimenti([a.nome.ancora], a.nome.completo).ids
      const rb = estraiRiferimenti([b.nome.ancora], b.nome.completo).ids
      if (ra.length > 0 && rb.length > 0) return confrontaVersetti(ra[0], rb[0])
      return ra.length > 0 ? -1 : rb.length > 0 ? 1 : a.nome.completo.localeCompare(b.nome.completo)
    })
    lista.forEach((e, i) => {
      let candidato = i === 0 ? base : `${base}.${disambiguatore(e.nome.ancora)}`
      if (candidato.endsWith('.')) candidato = `${base}.${i}`
      // Due omonimi con la stessa ancora libro+capitolo: si aggiunge l'indice.
      let finale = candidato
      let n = 2
      while (usati.has(finale)) finale = `${candidato}-${n++}`
      e.id = finale
      usati.add(finale)
      if (i > 0) disambiguati.push(`${e.nome.completo} → ${finale}`)
    })
  }
  if (usati.size !== entita.filter((e) => e.id !== '').length)
    err(etichettaFile, 'collisione di slug non risolta')
  return disambiguati
}

// ---------------------------------------------------------------------------
// OpenBible: indice per chiave TIPNR e per url_slug
// ---------------------------------------------------------------------------

interface RisoluzioneOb {
  descrizione: string
  lat: number
  lon: number
  tipo: string
  peso: number
}

interface LuogoOb {
  url_slug: string
  risoluzioni: RisoluzioneOb[]
  /** Risoluzioni senza coordinate (unknown_place, nonspecific_place, not_a_place…). */
  speciali: string[]
}

/** Via i tag XML delle descrizioni OpenBible: '<modern id="m…">Tel Rumeida</modern>' → 'Tel Rumeida'. */
function testoSemplice(descrizione: string): string {
  return descrizione.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function caricaOpenBible(): { perTipnr: Map<string, LuogoOb>; perSlug: Map<string, LuogoOb> } {
  const perTipnr = new Map<string, LuogoOb>()
  const perSlug = new Map<string, LuogoOb>()
  const testo = leggiObbligatorio(
    SORGENTE_OPENBIBLE,
    'Scaricare il dataset Bible Geocoding da openbible.info/geo in scripts/sources/Bible-Geocoding-Data-main/.',
  )

  for (const riga of testo.split(/\r?\n/)) {
    if (riga.trim() === '') continue
    const o = JSON.parse(riga) as {
      url_slug?: string
      linked_data?: Record<string, { id?: string; ids?: string[] }>
      identifications?: {
        id_source?: string
        special?: string
        score?: { time_total?: number }
        resolutions?: { lonlat?: string; description?: string; type?: string; special?: string }[]
      }[]
    }

    const risoluzioni: RisoluzioneOb[] = []
    const speciali: string[] = []
    for (const ident of o.identifications ?? []) {
      const grezzo = ident.score?.time_total ?? 0
      const peso = Math.round((Math.min(Math.max(grezzo, 0), 1000) / 1000) * 1000) / 1000
      for (const r of ident.resolutions ?? []) {
        if (r.special !== undefined || r.lonlat === undefined) {
          speciali.push(r.special ?? ident.special ?? 'senza coordinate')
          continue
        }
        const [lon, lat] = r.lonlat.split(',').map(Number)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        risoluzioni.push({ descrizione: testoSemplice(r.description ?? ''), lat, lon, tipo: r.type ?? '', peso })
      }
    }
    // Ordine di presentazione: prima i candidati più accreditati.
    risoluzioni.sort((a, b) => b.peso - a.peso)

    const voce: LuogoOb = { url_slug: o.url_slug ?? '', risoluzioni, speciali }
    if (voce.url_slug !== '' && !perSlug.has(voce.url_slug)) perSlug.set(voce.url_slug, voce)
    const collegamento = o.linked_data?.[CHIAVE_TIPNR_IN_OPENBIBLE]
    if (collegamento)
      for (const id of collegamento.ids ?? (collegamento.id ? [collegamento.id] : []))
        if (!perTipnr.has(id)) perTipnr.set(id, voce)
  }
  return { perTipnr, perSlug }
}

// ---------------------------------------------------------------------------
// Costruzione dei luoghi
// ---------------------------------------------------------------------------

const { perTipnr: obPerTipnr, perSlug: obPerSlug } = caricaOpenBible()

interface StatLuoghi {
  agganciatiPerId: number
  agganciatiPerNome: number
  senzaOpenBible: string[]
  senzaCoordinateTipnr: number
  candidatiTipnrFusi: number
  candidatiTipnrAggiunti: number
  risoluzioniSpeciali: number
  senzaAlcunCandidato: string[]
}

const statLuoghi: StatLuoghi = {
  agganciatiPerId: 0,
  agganciatiPerNome: 0,
  senzaOpenBible: [],
  senzaCoordinateTipnr: 0,
  candidatiTipnrFusi: 0,
  candidatiTipnrAggiunti: 0,
  risoluzioniSpeciali: 0,
  senzaAlcunCandidato: [],
}

/** Distanza euclidea in gradi: sufficiente per decidere "stesso sito" alla scala dei km. */
function vicini(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return Math.hypot(lat1 - lat2, lon1 - lon2) <= TOLLERANZA_GRADI
}

function costruisciLuogo(e: Entita): Luogo {
  const testa = e.rec.testa
  const nomeOpenBible = cella(testa, 1)

  // Join: prima per chiave TIPNR in linked_data, poi per url_slug ↔ colonna "OpenBible name".
  const chiave = `${e.nome.nome}@${e.nome.ancora}`
  let ob = obPerTipnr.get(chiave)
  if (ob) statLuoghi.agganciatiPerId++
  else {
    ob = nomeOpenBible === '' ? undefined : obPerSlug.get(slugifica(nomeOpenBible))
    if (ob) statLuoghi.agganciatiPerNome++
    else statLuoghi.senzaOpenBible.push(e.nome.completo)
  }
  statLuoghi.risoluzioniSpeciali += ob?.speciali.length ?? 0

  const candidati: CandidatoLuogo[] = []
  const usati = new Set<string>()
  const idCandidato = (suffisso: string): string => {
    const base = suffisso === '' ? `${e.id}.1` : `${e.id}.${suffisso}`
    let finale = base
    let n = 2
    while (usati.has(finale)) finale = `${base}-${n++}`
    usati.add(finale)
    return finale
  }

  for (const r of ob?.risoluzioni ?? []) {
    const etichetta = r.descrizione === '' ? 'candidato OpenBible senza descrizione' : r.descrizione
    candidati.push({
      id: idCandidato(slugifica(r.descrizione)),
      etichetta: r.tipo === '' ? etichetta : `${etichetta} (${r.tipo})`,
      lat: r.lat,
      lon: r.lon,
      pro: [],
      contro: [],
      peso_openbible: r.peso,
      fonti: [FONTE_OPENBIBLE],
    })
  }

  // Candidato dalle coordinate dell'URL Google Maps di TIPNR, solo se non coincide
  // con un candidato OpenBible: in quel caso il peso resterebbe non attribuibile.
  const coord = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(cella(testa, 4))
  if (coord === null) statLuoghi.senzaCoordinateTipnr++
  else {
    const lat = Number(coord[1])
    const lon = Number(coord[2])
    if (candidati.some((c) => vicini(lat, lon, c.lat, c.lon))) statLuoghi.candidatiTipnrFusi++
    else {
      statLuoghi.candidatiTipnrAggiunti++
      candidati.push({
        id: idCandidato('tipnr'),
        etichetta:
          nomeOpenBible === ''
            ? 'coordinate TIPNR (nessun candidato OpenBible corrispondente)'
            : `${nomeOpenBible} — coordinate TIPNR (nessun candidato OpenBible corrispondente)`,
        lat,
        lon,
        pro: [],
        contro: [],
        // peso_openbible omesso: il punteggio OpenBible non si riferisce a questa coordinata.
        fonti: [FONTE_TIPNR],
      })
    }
  }

  if (candidati.length === 0) statLuoghi.senzaAlcunCandidato.push(e.id)

  return {
    id: e.id,
    tipnr_id: e.nome.completo,
    nomi: { he: e.he, translit: e.translit, it: '' },
    status: STATUS_DI_PARTENZA,
    candidati,
    riferimenti: e.riferimenti,
    fonti: [FONTE_TIPNR],
    da_verificare: true,
  }
}

// ---------------------------------------------------------------------------
// Costruzione delle persone: grafo delle relazioni
// ---------------------------------------------------------------------------

interface StatPersone {
  linkTotali: number
  scartatiFuoriAmbito: number
  scartatiAntenato: number
  scartatiDiscendenza: number
  scartatiSeStesso: number
  ruoloIndeterminato: number
  padriInConflitto: number
  madriInConflitto: number
  /** Archi tenuti ma marcati "(?)" da TIPNR: decisione su un'ambiguità, non dato del testo. */
  ambigui: string[]
}

const statPersone: StatPersone = {
  linkTotali: 0,
  scartatiFuoriAmbito: 0,
  scartatiAntenato: 0,
  scartatiDiscendenza: 0,
  scartatiSeStesso: 0,
  ruoloIndeterminato: 0,
  padriInConflitto: 0,
  madriInConflitto: 0,
  ambigui: [],
}

/**
 * Un nome di parente come compare nelle colonne Parents/Partners/Offspring.
 * Restituisce null quando il marcatore dice che NON è un legame diretto.
 */
function risolviParente(grezzo: string, perTipnrId: Map<string, string>, contesto: string): string | null {
  let s = grezzo.trim()
  if (s === '' || s === '>') return null
  statPersone.linkTotali++
  if (s.includes('(a)')) {
    statPersone.scartatiAntenato++
    return null
  }
  if (s.includes('(d)')) {
    statPersone.scartatiDiscendenza++
    return null
  }
  const ambiguo = s.includes('(?)')
  s = s.replace('(?)', '').replace('(f)', '').trim()
  // Le colonne riportano l'UniqueName senza Strong; la chiave d'indice lo ignora.
  const id = perTipnrId.get(s)
  if (id === undefined) {
    statPersone.scartatiFuoriAmbito++
    return null
  }
  if (ambiguo) statPersone.ambigui.push(`${contesto} ↔ ${s}`)
  return id
}

/** Ruolo genitoriale dedotto dal campo Type di TIPNR ("Male"/"Female"). */
function ruoloGenitore(rec: RecordTipnr): 'padre' | 'madre' | null {
  const tipo = cella(rec.testa, 8).toLowerCase()
  if (tipo === 'male') return 'padre'
  if (tipo === 'female') return 'madre'
  return null
}

function costruisciPersone(entita: Entita[]): Persona[] {
  // Indice UniqueName (senza "=Strong") → id nostro, per risolvere le colonne di parentela.
  const perTipnrId = new Map<string, string>()
  for (const e of entita) {
    const senzaStrong = e.nome.completo.replace(/=[^=]*$/, '')
    perTipnrId.set(senzaStrong, e.id)
    // Le colonne citano talvolta la forma senza suffisso di libro.
    perTipnrId.set(`${e.nome.nome}@${e.nome.ancora}`, e.id)
  }

  // Grafo: archi genitore→figlio con ruolo, e archi coniugali simmetrici.
  const padreDi = new Map<string, string>() // figlio → padre
  const madreDi = new Map<string, string>() // figlio → madre
  const coniugi = new Map<string, Set<string>>()

  const aggiungiGenitore = (figlio: string, genitore: string, ruolo: 'padre' | 'madre'): void => {
    if (figlio === genitore) {
      statPersone.scartatiSeStesso++
      return
    }
    const mappa = ruolo === 'padre' ? padreDi : madreDi
    const esistente = mappa.get(figlio)
    if (esistente !== undefined && esistente !== genitore) {
      if (ruolo === 'padre') statPersone.padriInConflitto++
      else statPersone.madriInConflitto++
      return // primo dichiarato vince: la colonna Parents si legge prima di Offspring
    }
    mappa.set(figlio, genitore)
  }

  const aggiungiConiuge = (a: string, b: string): void => {
    if (a === b) {
      statPersone.scartatiSeStesso++
      return
    }
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const s = coniugi.get(x) ?? new Set<string>()
      s.add(y)
      coniugi.set(x, s)
    }
  }

  // Passo 1: colonna Parents ("Padre + Madre"), la più esplicita sui ruoli.
  for (const e of entita) {
    const grezzo = cella(e.rec.testa, 2)
    if (grezzo === '') continue
    const [padre, madre] = grezzo.split('+')
    const idPadre = risolviParente(padre ?? '', perTipnrId, e.nome.completo)
    if (idPadre !== null) aggiungiGenitore(e.id, idPadre, 'padre')
    const idMadre = risolviParente(madre ?? '', perTipnrId, e.nome.completo)
    if (idMadre !== null) aggiungiGenitore(e.id, idMadre, 'madre')
  }

  // Passo 2: colonna Offspring — il ruolo si deduce dal Type del genitore.
  for (const e of entita) {
    const grezzo = cella(e.rec.testa, 5)
    if (grezzo === '') continue
    const ruolo = ruoloGenitore(e.rec)
    for (const pezzo of grezzo.split(',')) {
      const idFiglio = risolviParente(pezzo, perTipnrId, e.nome.completo)
      if (idFiglio === null) continue
      if (ruolo === null) {
        statPersone.ruoloIndeterminato++
        continue
      }
      aggiungiGenitore(idFiglio, e.id, ruolo)
    }
  }

  // Passo 3: colonna Partners.
  for (const e of entita) {
    const grezzo = cella(e.rec.testa, 4)
    if (grezzo === '') continue
    for (const pezzo of grezzo.split(',')) {
      const idConiuge = risolviParente(pezzo, perTipnrId, e.nome.completo)
      if (idConiuge !== null) aggiungiConiuge(e.id, idConiuge)
    }
  }

  // Materializzazione: figli ricavati dagli archi genitoriali → reciprocità garantita.
  const figliDi = new Map<string, string[]>()
  for (const mappa of [padreDi, madreDi])
    for (const [figlio, genitore] of mappa) {
      const lista = figliDi.get(genitore) ?? []
      if (!lista.includes(figlio)) lista.push(figlio)
      figliDi.set(genitore, lista)
    }

  const persone: Persona[] = []
  for (const e of entita) {
    const relazioni: Relazioni = {
      padre: padreDi.get(e.id) ?? null,
      madre: madreDi.get(e.id) ?? null,
      coniugi: [...(coniugi.get(e.id) ?? [])].sort(),
      figli: (figliDi.get(e.id) ?? []).sort(),
    }
    persone.push({
      id: e.id,
      tipnr_id: e.nome.completo,
      nomi: { he: e.he, translit: e.translit, it: '' },
      relazioni,
      riferimenti: e.riferimenti,
      // TIPNR non porta le età: il blocco resta null, non si ricava dal testo a memoria.
      dati_narrativi: null,
      fonti: [FONTE_TIPNR],
      da_verificare: true,
    })
  }
  return persone
}

// ---------------------------------------------------------------------------
// Esecuzione
// ---------------------------------------------------------------------------

const records = analizzaTipnr(
  leggiObbligatorio(SORGENTE_TIPNR, 'Clonare github.com/STEPBible/STEPBible-Data in scripts/sources/.'),
)

const entitaPersone: Entita[] = []
const entitaLuoghi: Entita[] = []
const tipiPersona = new Map<string, number>()

for (const rec of records) {
  if (rec.tipo === 'OTHER') continue
  const e = costruisciEntita(rec)
  if (e === null) continue
  if (rec.tipo === 'PERSON') {
    entitaPersone.push(e)
    const tipo = cella(rec.testa, 8) || '(non dichiarato)'
    tipiPersona.set(tipo, (tipiPersona.get(tipo) ?? 0) + 1)
  } else entitaLuoghi.push(e)
}

const disambiguatiPersone = assegnaId(entitaPersone, 'bootstrap/people.json')
const disambiguatiLuoghi = assegnaId(entitaLuoghi, 'bootstrap/places.json')

const luoghi = entitaLuoghi.filter((e) => e.id !== '').map(costruisciLuogo)
const persone = costruisciPersone(entitaPersone.filter((e) => e.id !== ''))

// Validazione Zod prima della scrittura: se qui qualcosa non torna, è un bug dello script.
for (const l of luoghi) {
  const r = Luogo.safeParse(l)
  if (!r.success) for (const issue of r.error.issues) err(l.id, `${issue.path.join('.')}: ${issue.message}`)
}
for (const p of persone) {
  const r = Persona.safeParse(p)
  if (!r.success) for (const issue of r.error.issues) err(p.id, `${issue.path.join('.')}: ${issue.message}`)
}
for (const l of luoghi)
  for (const id of l.riferimenti)
    if (!versettiEsistenti.has(id)) err(l.id, `riferimento inesistente in public/data/verses/: "${id}"`)
for (const p of persone)
  for (const id of p.riferimenti)
    if (!versettiEsistenti.has(id)) err(p.id, `riferimento inesistente in public/data/verses/: "${id}"`)

if (errori.length > 0) {
  console.error(`import-tipnr: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori.slice(0, 50)) console.error(`  - ${e}`)
  if (errori.length > 50) console.error(`  … e altri ${errori.length - 50}`)
  process.exit(1)
}

/** Un record per riga: bozze ispezionabili e diff leggibili in revisione. */
function serializzaArray(records: unknown[]): string {
  return `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`
}

mkdirSync('bootstrap', { recursive: true })
writeFileSync(path.join('bootstrap', 'places.json'), serializzaArray(luoghi), 'utf8')
writeFileSync(path.join('bootstrap', 'people.json'), serializzaArray(persone), 'utf8')

// ---------------------------------------------------------------------------
// Riepilogo
// ---------------------------------------------------------------------------

const conRelazioni = persone.filter(
  (p) => p.relazioni.padre || p.relazioni.madre || p.relazioni.coniugi.length > 0 || p.relazioni.figli.length > 0,
).length
const totaleCandidati = luoghi.reduce((n, l) => n + l.candidati.length, 0)
const conPeso = luoghi.reduce((n, l) => n + l.candidati.filter((c) => c.peso_openbible !== undefined).length, 0)
const senzaEbraico = [...luoghi, ...persone].filter((x) => x.nomi.he === '').length
const senzaTranslit = [...luoghi, ...persone].filter((x) => x.nomi.translit === '').length

console.log('import-tipnr: bozze generate in bootstrap/ (NON in public/data/).\n')
console.log(`  bootstrap/people.json  ${persone.length} persone`)
console.log(`  bootstrap/places.json  ${luoghi.length} luoghi`)
console.log(`\n  RIFERIMENTI`)
console.log(`    ref LXX esclusi:                 ${scartatiLxxTotali}`)
console.log(`    ref fuori dal Pentateuco:        ${scartatiFuoriPentateucoTotali}`)
console.log(`    rimappaggi ENG→TM disponibili:   ${mappaEngTm.size}`)
console.log(`\n  NOMI (da compilare in revisione)`)
console.log(`    nomi.it vuoti:                   ${luoghi.length + persone.length}`)
console.log(`    nomi.he vuoti:                   ${senzaEbraico} (sub-record senza forma ebraica: ${senzaFormaEbraica})`)
console.log(`    nomi.translit vuoti:             ${senzaTranslit} (dStrong fuori da indices/lemmi.json: ${dStrongFuoriIndice})`)
console.log(`\n  LUOGHI`)
console.log(`    agganciati a OpenBible per id:   ${statLuoghi.agganciatiPerId}`)
console.log(`    agganciati per nome OpenBible:   ${statLuoghi.agganciatiPerNome}`)
console.log(`    senza corrispondenza OpenBible:  ${statLuoghi.senzaOpenBible.length}`)
for (const n of statLuoghi.senzaOpenBible) console.log(`      · ${n}`)
console.log(`    candidati totali:                ${totaleCandidati} (con peso_openbible: ${conPeso})`)
console.log(`    coordinata TIPNR fusa con OB:    ${statLuoghi.candidatiTipnrFusi}`)
console.log(`    coordinata TIPNR come candidato: ${statLuoghi.candidatiTipnrAggiunti}`)
console.log(`    luoghi senza coordinate TIPNR:   ${statLuoghi.senzaCoordinateTipnr}`)
console.log(`    risoluzioni OB "special" (no coord): ${statLuoghi.risoluzioniSpeciali}`)
console.log(`    luoghi senza alcun candidato:    ${statLuoghi.senzaAlcunCandidato.length}`)
if (disambiguatiLuoghi.length > 0) {
  console.log(`    id disambiguati (omonimi):       ${disambiguatiLuoghi.length}`)
  for (const d of disambiguatiLuoghi) console.log(`      · ${d}`)
}
console.log(`\n  PERSONE`)
for (const [tipo, n] of [...tipiPersona].sort((a, b) => b[1] - a[1])) console.log(`    tipo ${tipo.padEnd(24)} ${n}`)
console.log(`    con almeno una relazione:        ${conRelazioni}`)
console.log(`    link di parentela letti:         ${statPersone.linkTotali}`)
console.log(`      scartati, entità fuori ambito: ${statPersone.scartatiFuoriAmbito}`)
console.log(`      scartati, marcatore (a) antenato: ${statPersone.scartatiAntenato}`)
console.log(`      scartati, marcatore (d) discendenza: ${statPersone.scartatiDiscendenza}`)
console.log(`      scartati, auto-riferimento:    ${statPersone.scartatiSeStesso}`)
console.log(`      scartati, ruolo indeterminato: ${statPersone.ruoloIndeterminato}`)
console.log(`      conflitti padre / madre:       ${statPersone.padriInConflitto} / ${statPersone.madriInConflitto}`)
console.log(`    link tenuti ma marcati "(?)" da TIPNR (decisione su un'ambiguità, da rivedere): ${statPersone.ambigui.length}`)
for (const a of statPersone.ambigui) console.log(`      · ${a}`)
if (disambiguatiPersone.length > 0) {
  console.log(`    id disambiguati (omonimi):       ${disambiguatiPersone.length}`)
  for (const d of disambiguatiPersone.slice(0, 40)) console.log(`      · ${d}`)
  if (disambiguatiPersone.length > 40) console.log(`      … e altri ${disambiguatiPersone.length - 40}`)
}
