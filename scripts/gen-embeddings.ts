// scripts/gen-embeddings.ts — Task F4.1.
// Genera public/data/embeddings.json: i vettori precomputati che il modulo assistente
// (§9 della specifica) usa per il retrieval client-side. File [G]: mai editarlo a mano,
// si corregge qui e si rigenera.
//
// COSA SI EMBEDDA (e perché)
// --------------------------
// Esattamente il materiale che l'assistente ha il permesso di usare (SCHEMI-DATI §2.10):
//   - la TRADUZIONE LETTERALE curata (public/data/translations/letterale.json) → una voce
//     "versetto" per ogni versetto già reso;
//   - il TESTO DELLE NOTE curate (public/data/notes.json) → una voce "nota" per ognuna.
// Non si embedda l'ebraico: le query dell'assistente sono in italiano e l'assistente
// conosce solo il curato. Si legge SOLO da public/data (il dataset curato), mai da
// bootstrap/: le bozze non revisionate non devono finire nel retrieval.
//
// Per le note si concatena `titolo` + `testo`: il titolo è contenuto a tutti gli effetti
// (spesso porta la tesi della nota in forma sintetica) e migliora il recupero. Il campo
// meta.testo_sorgente lo dichiara.
//
// MODELLO E NORMALIZZAZIONE
// -------------------------
// Embedding via Ollama locale (BGE-M3, 1024 dim), endpoint /api/embed. I vettori sono
// normalizzati L2 e arrotondati a 6 decimali: così a runtime la cosine similarity è un
// semplice prodotto scalare e il JSON resta leggibile e diffabile. La dimensione emessa
// dal modello viene verificata contro l'attesa (meta.dim) prima di scrivere.
//
// PREREQUISITO: Ollama in ascolto su localhost:11434 con il modello scaricato
// (`ollama pull bge-m3`). Se manca il modello o il server non risponde, lo script si
// ferma con istruzioni e NON scrive nulla.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { CodiceLibro, Embeddings, Nota, Traduzione, type VoceEmbedding } from '../src/tipi/index.ts'

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------

const OLLAMA = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const MODELLO = process.env.EMB_MODEL ?? 'bge-m3'
const DIM_ATTESA = 1024

const FILE_LETTERALE = path.join('public', 'data', 'translations', 'letterale.json')
const FILE_NOTE = path.join('public', 'data', 'notes.json')
const DIR_OUT = path.join('public', 'data')
const FILE_OUT = path.join(DIR_OUT, 'embeddings.json')

const errori: string[] = []
function err(dove: string, messaggio: string): void {
  errori.push(`${dove} — ${messaggio}`)
}

function fine(): never {
  console.error(`gen-embeddings: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori) console.error(`  - ${e}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Sorgenti (solo public/data)
// ---------------------------------------------------------------------------

/** Testo da embeddare, con l'identità della voce risultante. Ordine canonico deciso qui. */
interface Sorgente {
  tipo: VoceEmbedding['tipo']
  ref: string
  testo: string
}

const ORDINE_LIBRI = new Map<string, number>(CodiceLibro.options.map((c, i) => [c, i]))

/** Ordina "gen.1.1" canonicamente (libro, capitolo, versetto). ref ignoti finiscono in coda. */
function chiaveVersetto(ref: string): [number, number, number] {
  const [libro, cap, ver] = ref.split('.')
  return [ORDINE_LIBRI.get(libro) ?? 999, Number(cap) || 0, Number(ver) || 0]
}

function leggiJson(file: string): unknown | null {
  if (!existsSync(file)) {
    err(file, 'file assente')
    return null
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    err(file, `JSON non analizzabile: ${(e as Error).message}`)
    return null
  }
}

const sorgenti: Sorgente[] = []

// Traduzione letterale → voci "versetto"
const grezzoLetterale = leggiJson(FILE_LETTERALE)
if (grezzoLetterale) {
  const parsed = Traduzione.safeParse(grezzoLetterale)
  if (!parsed.success) err(FILE_LETTERALE, `non conforme allo schema Traduzione: ${parsed.error.issues[0]?.message}`)
  else {
    const versetti = Object.entries(parsed.data.testi)
      .map(([ref, testo]) => ({ tipo: 'versetto' as const, ref, testo: testo.trim() }))
      .filter((s) => s.testo !== '')
      .sort((a, b) => {
        const ka = chiaveVersetto(a.ref)
        const kb = chiaveVersetto(b.ref)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
      })
    sorgenti.push(...versetti)
  }
}

// Note curate → voci "nota" (titolo + testo)
const grezzoNote = leggiJson(FILE_NOTE)
if (grezzoNote) {
  if (!Array.isArray(grezzoNote)) err(FILE_NOTE, 'atteso un array di note')
  else {
    const note = grezzoNote
      .map((n, i): Sorgente | null => {
        const parsed = Nota.safeParse(n)
        if (!parsed.success) {
          err(FILE_NOTE, `note[${i}] non conforme allo schema Nota: ${parsed.error.issues[0]?.message}`)
          return null
        }
        const { id, titolo, testo } = parsed.data
        return { tipo: 'nota', ref: id, testo: `${titolo}\n${testo}`.trim() }
      })
      .filter((s): s is Sorgente => s !== null)
      .sort((a, b) => a.ref.localeCompare(b.ref))
    sorgenti.push(...note)
  }
}

if (errori.length > 0) fine()
if (sorgenti.length === 0) {
  err('sorgenti', 'nessun testo da embeddare (letterale e note vuoti?)')
  fine()
}

// ---------------------------------------------------------------------------
// 2. Embedding via Ollama
// ---------------------------------------------------------------------------

async function embed(testo: string): Promise<number[]> {
  let risposta: Response
  try {
    risposta = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELLO, input: testo }),
    })
  } catch (e) {
    throw new Error(
      `Ollama non raggiungibile su ${OLLAMA} (${(e as Error).message}). Avviare il server con \`ollama serve\`.`,
    )
  }
  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => '')
    if (risposta.status === 404 || /not found|try pulling/i.test(corpo)) {
      throw new Error(`modello "${MODELLO}" non disponibile in Ollama. Scaricarlo con \`ollama pull ${MODELLO}\`.`)
    }
    throw new Error(`Ollama ha risposto ${risposta.status}: ${corpo.slice(0, 200)}`)
  }
  const dati = (await risposta.json()) as { embeddings?: number[][]; embedding?: number[] }
  // /api/embed restituisce { embeddings: [[…]] }; tolleriamo anche il legacy { embedding: […] }.
  const vettore = dati.embeddings?.[0] ?? dati.embedding
  if (!Array.isArray(vettore)) throw new Error(`risposta di embedding senza vettore: ${JSON.stringify(dati).slice(0, 200)}`)
  return vettore
}

/** Normalizza L2 e arrotonda a 6 decimali. */
function normalizza(v: number[]): number[] {
  const norma = Math.hypot(...v)
  if (norma === 0) return v.map(() => 0)
  return v.map((x) => Math.round((x / norma) * 1e6) / 1e6)
}

const voci: VoceEmbedding[] = []
let dimVista: number | null = null

process.stdout.write(`gen-embeddings: ${sorgenti.length} testi da embeddare con "${MODELLO}" su ${OLLAMA}\n`)

for (let i = 0; i < sorgenti.length; i++) {
  const s = sorgenti[i]
  let vettore: number[]
  try {
    vettore = await embed(s.testo)
  } catch (e) {
    // Errori di prerequisito (server giù, modello mancante): inutile insistere sugli altri.
    err(`${s.tipo} ${s.ref}`, (e as Error).message)
    fine()
  }
  if (dimVista === null) dimVista = vettore.length
  else if (vettore.length !== dimVista) err(`${s.tipo} ${s.ref}`, `dimensione ${vettore.length}, diversa dalle precedenti (${dimVista})`)
  voci.push({ tipo: s.tipo, ref: s.ref, v: normalizza(vettore) })
  if ((i + 1) % 20 === 0 || i + 1 === sorgenti.length) process.stdout.write(`  ${i + 1}/${sorgenti.length}\n`)
}

if (dimVista !== DIM_ATTESA)
  err('dimensione', `il modello "${MODELLO}" emette vettori a ${dimVista} dim, attese ${DIM_ATTESA} (BGE-M3). Modello sbagliato?`)

if (errori.length > 0) fine()

// ---------------------------------------------------------------------------
// 3. Scrittura
// ---------------------------------------------------------------------------

const file = Embeddings.parse({
  meta: {
    modello: MODELLO,
    dim: dimVista,
    normalizzati: true,
    testo_sorgente: 'traduzione letterale (testo del versetto) + note (titolo + testo)',
    generato: new Date().toISOString().slice(0, 10),
  },
  voci,
})

mkdirSync(DIR_OUT, { recursive: true })
// Una voce per riga: file [G] ispezionabile e diff leggibili tra rigenerazioni.
const corpoVoci = file.voci.map((voce) => `  ${JSON.stringify(voce)}`).join(',\n')
writeFileSync(
  FILE_OUT,
  `{\n${JSON.stringify('meta')}: ${JSON.stringify(file.meta)},\n${JSON.stringify('voci')}: [\n${corpoVoci}\n]\n}\n`,
  'utf8',
)

// ---------------------------------------------------------------------------
// 4. Riepilogo
// ---------------------------------------------------------------------------

const nVersetti = file.voci.filter((v) => v.tipo === 'versetto').length
const nNote = file.voci.filter((v) => v.tipo === 'nota').length
console.log('\ngen-embeddings: generazione completata.\n')
console.log(`  modello:        ${file.meta.modello} (${file.meta.dim} dim, normalizzati L2)`)
console.log(`  voci scritte:   ${file.voci.length} (${nVersetti} versetti, ${nNote} note)`)
console.log(`  file:           ${FILE_OUT}`)
