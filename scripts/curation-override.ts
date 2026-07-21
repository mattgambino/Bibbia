// scripts/curation-override.ts — Task F1.3-fix.
// Salva e riapplica la curation manuale fatta sulle bozze bootstrap/places.json e
// bootstrap/people.json, che `import-tipnr.ts` sovrascrive a ogni rigenerazione
// (avvertenza in coda a F1.3 in ROADMAP).
//
// L'indice è il `tipnr_id`: è la chiave d'origine del dataset, non cambia quando lo
// slug viene ritoccato in revisione, ed è l'unico aggancio che ha già retto una
// rinomina di massa (F1.3 punto 4). Gli id dei candidati invece NON sono stabili —
// derivano dalla descrizione OpenBible — quindi un override su un candidato che
// dopo la rigenerazione non esiste più viene segnalato, mai applicato in silenzio.
//
// FLUSSO DI UNA RIGENERAZIONE
// ---------------------------
//   1. copiare bootstrap/ altrove                 (la copia è la versione curata)
//   2. npx tsx scripts/import-tipnr.ts            (bootstrap/ torna pristino)
//   3. npx tsx scripts/curation-override.ts estrai <copia> bootstrap
//   4. npx tsx scripts/curation-override.ts applica
//
// Il diff è per foglia: gli oggetti si attraversano (`nomi.it`, `nomi.translit`),
// gli array si trattano come valore unico (`fonti`, `riferimenti`) perché un diff
// per indice non sopravvive a un riordino della sorgente. Per ogni campo si tiene
// anche il valore generato che la curation ha sostituito: in fase di applicazione,
// se il generato è cambiato sotto, la curation vince comunque ma la divergenza
// viene stampata — è il segnale che quel dato va rivisto a mano.

import { readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'

const FILE_OVERRIDE = 'curation-override.json'

/** Le due collezioni gestite: nome del file ↔ chiave nel file di override. */
const COLLEZIONI = [
  { file: 'places.json', chiave: 'luoghi' },
  { file: 'people.json', chiave: 'persone' },
] as const

interface Campo {
  generato: unknown
  curato: unknown
}
interface RecordOverride {
  id_bozza: string
  campi: Record<string, Campo>
  candidati?: Record<string, Record<string, Campo>>
}
interface FileOverride {
  meta: {
    descrizione: string
    generato: string
    script: string
    indice: string
  }
  luoghi: Record<string, RecordOverride>
  persone: Record<string, RecordOverride>
}

type Grezzo = Record<string, unknown>

function leggiArray(file: string): Grezzo[] {
  return JSON.parse(readFileSync(file, 'utf8')) as Grezzo[]
}

/** Serializzazione identica a quella di import-tipnr.ts: un record per riga. */
function serializzaArray(records: unknown[]): string {
  return `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`
}

function eOggetto(v: unknown): v is Grezzo {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function uguali(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Differenze foglia fra due record, come mappa "percorso.puntato" → { generato, curato }. */
function diffFoglie(generato: Grezzo, curato: Grezzo, prefisso = ''): Record<string, Campo> {
  const out: Record<string, Campo> = {}
  for (const chiave of Object.keys(curato)) {
    const percorso = prefisso === '' ? chiave : `${prefisso}.${chiave}`
    const g = generato[chiave]
    const c = curato[chiave]
    if (uguali(g, c)) continue
    if (eOggetto(g) && eOggetto(c)) Object.assign(out, diffFoglie(g, c, percorso))
    else out[percorso] = { generato: g, curato: c }
  }
  return out
}

/** Scrive un valore su un percorso puntato, creando gli oggetti intermedi mancanti. */
function scriviPercorso(bersaglio: Grezzo, percorso: string, valore: unknown): void {
  const parti = percorso.split('.')
  let nodo = bersaglio
  for (const parte of parti.slice(0, -1)) {
    if (!eOggetto(nodo[parte])) nodo[parte] = {}
    nodo = nodo[parte] as Grezzo
  }
  nodo[parti[parti.length - 1]] = valore
}

function leggiValorePercorso(sorgente: Grezzo, percorso: string): unknown {
  let nodo: unknown = sorgente
  for (const parte of percorso.split('.')) {
    if (!eOggetto(nodo)) return undefined
    nodo = nodo[parte]
  }
  return nodo
}

// ---------------------------------------------------------------------------
// estrai
// ---------------------------------------------------------------------------

function estrai(dirCurata: string, dirPristina: string): void {
  const override: FileOverride = {
    meta: {
      descrizione:
        'Curation manuale sulle bozze bootstrap/, da riapplicare dopo ogni esecuzione di import-tipnr.ts.',
      generato: new Date().toISOString().slice(0, 10),
      script: 'curation-override.ts estrai',
      indice: 'tipnr_id',
    },
    luoghi: {},
    persone: {},
  }

  for (const { file, chiave } of COLLEZIONI) {
    const curati = leggiArray(path.join(dirCurata, file))
    const pristini = leggiArray(path.join(dirPristina, file))
    const perTipnr = new Map(pristini.map((r) => [String(r.tipnr_id), r]))

    let conOverride = 0
    let senzaCorrispondenza = 0

    for (const curato of curati) {
      const tipnr = String(curato.tipnr_id)
      const pristino = perTipnr.get(tipnr)
      if (!pristino) {
        console.error(`  ATTENZIONE ${file}: tipnr_id "${tipnr}" (id ${String(curato.id)}) assente dalla versione pristina — curation non estraibile`)
        senzaCorrispondenza++
        continue
      }

      // I candidati si confrontano per id, non per posizione: l'ordine dipende dal peso.
      const { candidati: candCurati, ...restoCurato } = curato
      const { candidati: candPristini, ...restoPristino } = pristino
      const campi = diffFoglie(restoPristino as Grezzo, restoCurato as Grezzo)

      const candidati: Record<string, Record<string, Campo>> = {}
      if (Array.isArray(candCurati) && Array.isArray(candPristini)) {
        const perId = new Map((candPristini as Grezzo[]).map((c) => [String(c.id), c]))
        for (const cc of candCurati as Grezzo[]) {
          const cp = perId.get(String(cc.id))
          if (!cp) {
            // Candidato aggiunto a mano: si tiene per intero, non come diff.
            candidati[String(cc.id)] = { '(candidato-intero)': { generato: undefined, curato: cc } }
            continue
          }
          const d = diffFoglie(cp, cc)
          if (Object.keys(d).length > 0) candidati[String(cc.id)] = d
        }
      }

      if (Object.keys(campi).length === 0 && Object.keys(candidati).length === 0) continue
      const voce: RecordOverride = { id_bozza: String(curato.id), campi }
      if (Object.keys(candidati).length > 0) voce.candidati = candidati
      override[chiave][tipnr] = voce
      conOverride++
    }

    console.log(`  ${file}: ${conOverride} record con curation manuale su ${curati.length}${senzaCorrispondenza > 0 ? `, ${senzaCorrispondenza} senza corrispondenza` : ''}`)
  }

  writeFileSync(FILE_OVERRIDE, `${JSON.stringify(override, null, 2)}\n`, 'utf8')

  const nCampi = (c: Record<string, RecordOverride>): number =>
    Object.values(c).reduce(
      (n, r) => n + Object.keys(r.campi).length + Object.values(r.candidati ?? {}).reduce((m, d) => m + Object.keys(d).length, 0),
      0,
    )
  console.log(`\nscritto ${FILE_OVERRIDE}: ${Object.keys(override.luoghi).length} luoghi (${nCampi(override.luoghi)} campi), ${Object.keys(override.persone).length} persone (${nCampi(override.persone)} campi)`)
}

// ---------------------------------------------------------------------------
// applica
// ---------------------------------------------------------------------------

function applica(dir: string): void {
  const override = JSON.parse(readFileSync(FILE_OVERRIDE, 'utf8')) as FileOverride
  let totApplicati = 0
  let totDivergenti = 0
  let totFalliti = 0

  for (const { file, chiave } of COLLEZIONI) {
    const percorso = path.join(dir, file)
    const records = leggiArray(percorso)
    const perTipnr = new Map(records.map((r) => [String(r.tipnr_id), r]))
    let applicati = 0
    let recordToccati = 0

    for (const [tipnr, voce] of Object.entries(override[chiave])) {
      const record = perTipnr.get(tipnr)
      if (!record) {
        console.error(`  NON APPLICATO ${file}: tipnr_id "${tipnr}" (era ${voce.id_bozza}) non esiste più`)
        totFalliti += Object.keys(voce.campi).length
        continue
      }
      recordToccati++

      for (const [percorsoCampo, campo] of Object.entries(voce.campi)) {
        const attuale = leggiValorePercorso(record, percorsoCampo)
        if (!uguali(attuale, campo.generato)) {
          console.error(`  DIVERGENZA ${file} ${String(record.id)} . ${percorsoCampo}: il generato è cambiato (${JSON.stringify(campo.generato)} → ${JSON.stringify(attuale)}), applico comunque la curation ${JSON.stringify(campo.curato)}`)
          totDivergenti++
        }
        scriviPercorso(record, percorsoCampo, campo.curato)
        applicati++
      }

      for (const [idCandidato, diff] of Object.entries(voce.candidati ?? {})) {
        const candidati = record.candidati as Grezzo[] | undefined
        const candidato = candidati?.find((c) => String(c.id) === idCandidato)
        if (!candidato) {
          console.error(`  NON APPLICATO ${file} ${String(record.id)}: candidato "${idCandidato}" non esiste più dopo la rigenerazione (${Object.keys(diff).join(', ')})`)
          totFalliti += Object.keys(diff).length
          continue
        }
        for (const [percorsoCampo, campo] of Object.entries(diff)) {
          if (percorsoCampo === '(candidato-intero)') continue // già presente per definizione
          const attuale = leggiValorePercorso(candidato, percorsoCampo)
          if (!uguali(attuale, campo.generato)) {
            console.error(`  DIVERGENZA ${file} ${String(record.id)} candidato ${idCandidato} . ${percorsoCampo}: generato cambiato, applico comunque la curation`)
            totDivergenti++
          }
          scriviPercorso(candidato, percorsoCampo, campo.curato)
          applicati++
        }
      }
    }

    writeFileSync(percorso, serializzaArray(records), 'utf8')
    console.log(`  ${file}: ${applicati} campi riapplicati su ${recordToccati} record`)
    totApplicati += applicati
  }

  console.log(`\ntotale: ${totApplicati} campi riapplicati, ${totDivergenti} con generato divergente, ${totFalliti} non applicabili`)
  if (totFalliti > 0) {
    console.error('\nAlcuni override non sono stati applicati: vanno rivisti a mano prima di considerare le bozze pronte.')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const [comando, ...argomenti] = process.argv.slice(2)

switch (comando) {
  case 'estrai': {
    if (argomenti.length !== 2) {
      console.error('uso: npx tsx scripts/curation-override.ts estrai <dir-curata> <dir-pristina>')
      process.exit(2)
    }
    estrai(argomenti[0], argomenti[1])
    break
  }
  case 'applica': {
    applica(argomenti[0] ?? 'bootstrap')
    break
  }
  default:
    console.error('uso: npx tsx scripts/curation-override.ts estrai <dir-curata> <dir-pristina>')
    console.error('     npx tsx scripts/curation-override.ts applica [dir]')
    process.exit(2)
}
