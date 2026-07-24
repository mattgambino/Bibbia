// scripts/rapporto-composizione.ts — rapporto di istruttoria, sola lettura.
//
// Copre due domande aperte:
//   1. il ventaglio delle posizioni contro il `composizione.range` di ciascuna
//      pericope (l'estremo alto -900);
//   2. le posizioni che di fatto sono scelte editoriali del progetto.
//
// LO SCRIPT NON SCRIVE MAI FILE DI DATI. L'unica uscita è
// export/rapporto-composizione.md. Le sintesi sono riportate VERBATIM: non
// vengono riformulate, accorciate o normalizzate.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import type { Evento, Fonte } from '../src/tipi/index.ts'

const RADICE = path.resolve(import.meta.dirname, '..')
const EVENTS = path.join(RADICE, 'public/data/events.json')
const USCITA = path.join(RADICE, 'export/rapporto-composizione.md')

const eventi = JSON.parse(readFileSync(EVENTS, 'utf8')) as Evento[]

function fonteBreve(f: Fonte): string {
  const parti = [f.autore, f.titolo].filter(Boolean)
  return `${f.tipo}: ${parti.join(', ') || '(senza titolo)'}`
}

const r: string[] = []
r.push('# Rapporto — asse composizione')
r.push('')
r.push('Generato da `scripts/rapporto-composizione.ts`. **Nessun file di dati è stato scritto.** Sintesi ed etichette sono verbatim.')
r.push('')

// ---------------------------------------------------------------------------
// Punto strutturale che precede ogni conteggio
// ---------------------------------------------------------------------------
r.push('## 0. Due fatti di schema, da verificare prima di decidere')
r.push('')
r.push('**(a) `PosizioneComposizione` non ha un campo di datazione.** Lo schema (`src/tipi/evento.ts`) è:')
r.push('')
r.push('```')
r.push('PosizioneComposizione = { etichetta: string, sintesi: string, fonti: Fonte[] }')
r.push('```')
r.push('')
r.push(
  "Le date compaiono **solo dentro la prosa** di `etichetta` e `sintesi` («redazione esilica», «VI secolo», «postesilica»). Un inviluppo derivato dalle posizioni non è quindi calcolabile: bisognerebbe estrarre gli anni dal testo, cioè interpretarlo. Questo rapporto non lo fa — riporta il testo e lascia il confronto all'occhio.",
)
r.push('')
r.push('**(b) `PosizioneComposizione` non ha un campo `confidence`.** L\'unico `confidence` in `evento.ts` sta su `TempoStorico`. Una posizione di composizione porta oggi etichetta, sintesi e fonti, e nient\'altro.')
r.push('')
r.push('```')
r.push('Nota = { id, target, tipo, titolo, testo, confidence: Confidenza, ... }   ← confidence OBBLIGATORIO')
r.push('```')
r.push('')
r.push(
  "`Nota` invece **ha** `confidence` obbligatorio, e il suo `tipo` è un enum chiuso di cinque valori (filologica, storica, geografica, tradizione_ebraica, divergenza_traduttiva) in cui non esiste «scelta editoriale».",
)
r.push('')

// ---------------------------------------------------------------------------
// 1. Ventaglio per pericope
// ---------------------------------------------------------------------------
r.push('## 1. Ventaglio delle posizioni, pericope per pericope')
r.push('')
r.push(`Pericopi in \`events.json\`: **${eventi.length}**.`)
r.push('')
const per900 = eventi.filter((e) => e.composizione.range.da === -900)
const altri = eventi.filter((e) => e.composizione.range.da !== -900)
r.push(`- con \`range.da === -900\`: **${per900.length}**`)
r.push(`- con altro estremo alto: **${altri.length}** → ${altri.map((e) => `\`${e.id}\` (${e.composizione.range.da})`).join(', ')}`)
r.push('')

for (const e of eventi) {
  const c = e.composizione
  r.push(`### \`${e.id}\` — ${e.titolo}`)
  r.push('')
  r.push(`\`range\`: **${c.range.da} → ${c.range.a}** · \`${e.range.da}\`–\`${e.range.a}\` · posizioni: ${c.posizioni.length}`)
  r.push('')
  if (c.posizioni.length === 0) r.push('_Nessuna posizione._')
  for (const [i, p] of c.posizioni.entries()) {
    r.push(`**[${i}] ${p.etichetta}**`)
    r.push('')
    r.push(`> ${p.sintesi.replace(/\n/g, '\n> ')}`)
    r.push('')
    if (p.fonti.length === 0) r.push('- fonti: **nessuna**')
    else for (const f of p.fonti) r.push(`- fonte — ${fonteBreve(f)}`)
    r.push('')
  }
}

// ---------------------------------------------------------------------------
// 2. Posizioni senza fonti
// ---------------------------------------------------------------------------
r.push('## 2. Posizioni senza fonti')
r.push('')
const senzaFonti: { evento: Evento; indice: number; etichetta: string; sintesi: string }[] = []
for (const e of eventi)
  for (const [i, p] of e.composizione.posizioni.entries())
    if (p.fonti.length === 0) senzaFonti.push({ evento: e, indice: i, etichetta: p.etichetta, sintesi: p.sintesi })
r.push(`Totale: **${senzaFonti.length}**`)
r.push('')
for (const s of senzaFonti) {
  r.push(`### \`${s.evento.id}\` [${s.indice}] — ${s.etichetta}`)
  r.push('')
  r.push(`> ${s.sintesi.replace(/\n/g, '\n> ')}`)
  r.push('')
}

// ---------------------------------------------------------------------------
// 3. Posizioni CON fonti che parlano del progetto
// ---------------------------------------------------------------------------
r.push('## 3. Posizioni con fonti la cui sintesi parla del progetto')
r.push('')
r.push(
  'Criterio meccanico e volutamente grossolano: la sintesi contiene una delle spie «scelta editoriale», «semplificazione», «il modello», «questo progetto», «non asserit». Va letta a mano — è un filtro testuale, non un giudizio.',
)
r.push('')
const SPIE = /scelta editoriale|semplificazion|il modello|questo progetto|non asserit/i
const editorialiConFonte: string[] = []
for (const e of eventi)
  for (const [i, p] of e.composizione.posizioni.entries())
    if (SPIE.test(p.sintesi) || SPIE.test(p.etichetta)) {
      const nf = p.fonti.length
      editorialiConFonte.push(`- \`${e.id}\` [${i}] «${p.etichetta}» — fonti: ${nf}${nf === 0 ? ' (già nell\'elenco sopra)' : ''}`)
    }
r.push(editorialiConFonte.length ? editorialiConFonte.join('\n') : '_Nessuna._')
r.push('')

// ---------------------------------------------------------------------------
// 4. Riepilogo
// ---------------------------------------------------------------------------
r.push('## 4. Riepilogo')
r.push('')
const totPos = eventi.reduce((n, e) => n + e.composizione.posizioni.length, 0)
r.push(`- posizioni totali: **${totPos}**`)
r.push(`- di cui senza fonti: **${senzaFonti.length}**`)
r.push(`- pericopi con \`range.da === -900\`: **${per900.length}** su ${eventi.length}`)
r.push(`- posizioni la cui sintesi contiene una spia di scelta editoriale: **${editorialiConFonte.length}**`)
r.push('')

mkdirSync(path.dirname(USCITA), { recursive: true })
writeFileSync(USCITA, r.join('\n'), 'utf8')

console.log(`rapporto-composizione: scritto ${path.relative(RADICE, USCITA)}`)
console.log(`  pericopi: ${eventi.length} · posizioni: ${totPos} · senza fonti: ${senzaFonti.length}`)
console.log(`  range.da === -900: ${per900.length}`)
console.log(`  posizioni con spia di scelta editoriale: ${editorialiConFonte.length}`)
console.log('  NESSUN file di dati scritto.')
