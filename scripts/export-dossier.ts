// scripts/export-dossier.ts — Task F5.2.
// Rende leggibile fuori dall'app il dataset CURATO [C] di public/data/, in un unico
// Markdown stampabile: export/dossier-curation.md.
//
// NON È UN BACKUP. Versioning e ripristino li coprono già git e il remoto; qui si
// produce un documento di lettura, pensato per la passata di verifica F5.3 (rassegna
// in blocco di tutti i record con `da_verificare: true`) su schermo, su PDF o su carta.
//
// REGOLA CENTRALE: nessun contenuto generato.
// Lo script COPIA i campi verbatim — non riassume, non riformula, non completa, non
// deduce. L'unico testo scritto qui sono le intestazioni, le etichette dei campi e le
// frasi che dichiarano un'assenza («nessun ancoraggio storico»): tutto il resto viene
// dai JSON. Nessun testo biblico e nessuna traduzione sono ricostruiti: la letterale è
// riversata dal file, versetto per versetto (regola 1 di CLAUDE.md).
//
// SORGENTI — solo i file [C] di public/data/ (SCHEMI-DATI §3):
//   events.json, notes.json, places.json, people.json, lexicon_it.json,
//   translations/letterale.json, translations/index.json.
// I file [G] (verses, words, crossrefs, indices, luzzi, embeddings) restano fuori:
// sono rigenerabili dagli script di import e non sono lavoro di curation.
// Lo script NON scrive mai in public/data/ né in bootstrap/: il solo output è export/.
//
// ORDINAMENTO — canonico, mai alfabetico per slug.
// Ogni record è collocato sul suo primo riferimento biblico e ordinato con
// `chiaveVersetto` (ordine dei libri gen exo lev num deu, poi capitolo e versetto
// numerici: l'ordine lessicografico metterebbe gen.10.1 prima di gen.2.1).
//   events   → range.da
//   notes    → target.ref, con `pericope` sul `da`, `parola` sul versetto che la contiene,
//              `luogo`/`persona` sul primo riferimento dell'entità
//   places   → riferimenti[0]      people → riferimenti[0]
//   letterale→ chiave del versetto
// Unica eccezione: lexicon_it, che non ha riferimento canonico e va per chiave dStrong.
// A parità di chiave si conserva l'ordine del file (ordine della curation), non si
// riordina per id: `Array.sort` è stabile, quindi l'output resta deterministico.
// I record il cui riferimento non è risolvibile finiscono in una sezione di coda
// «senza riferimento canonico», che compare solo se non è vuota.
//
// TRE ASSI, TRE BLOCCHI (specifica §3.3): tempo narrato, tempo storico-critico e
// composizione sono tre sottosezioni distinte con le loro etichette, mai una linea sola.
// Il narrato conta in Anno Mundi e usa `etichettaAnniMundi`; gli altri due contano in
// era cristiana e usano `etichettaAnni`. Usare la stessa etichetta per entrambi
// fonderebbe due conteggi diversi.
//
// MARKDOWN
// - Ancore interne: le intestazioni passano tutte da `creaSlugger()`, che riproduce la
//   regola GitHub (minuscolo, via tutto ciò che non è lettera/cifra/spazio/-/_,
//   spazi → trattini, dedup progressivo con -1, -2). L'indice dei `da_verificare` linka
//   quelle ancore; su carta resta navigabile perché ogni voce dell'indice porta anche
//   riferimento, titolo e id, che sono esattamente ciò che si legge nell'intestazione.
// - Escape: il testo curato è dato, non markup. `esc()` neutralizza \ ` * _ [ ] < |
//   inline; `escBlocco()` aggiunge i caratteri che a inizio riga aprirebbero un blocco
//   (# > - + = e "1."). Lo slug si calcola sul testo NON escapato, perché il backslash
//   non compare nel testo reso: così ancora e intestazione restano d'accordo.
// - Ebraico: i CAMPI ebraici (nomi.he) vanno in backtick, per non far sbandare la riga
//   con la bidirezionalità. Dentro la prosa curata l'ebraico in linea resta dov'è:
//   spostarlo vorrebbe dire riformulare, e la prosa è verbatim.
//
// DETERMINISMO: due esecuzioni sugli stessi dati danno file identici a meno di una riga,
// la data di generazione in testa — che è un dato richiesto del documento, non un
// residuo di non determinismo. Nessuna iterazione su strutture a ordine incerto.
//
// Uso:  npx tsx scripts/export-dossier.ts [--solo-da-verificare]
//       npm run dossier
//       --solo-da-verificare  → stessa struttura, filtrata ai record con
//                               da_verificare: true, in export/dossier-curation-da-verificare.md
// Su file non conforme agli schemi Zod: errori a video, uscita non-zero, nessun output.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { Evento, LexiconIt, Luogo, ManifestTraduzioni, Nota, Persona, Traduzione } from '../src/tipi/index.ts'
import type { Confidenza, Fonte, Nomi, VoceLexiconIt } from '../src/tipi/index.ts'
import { ETICHETTA_CONFIDENZA, GLOSSA_CONFIDENZA } from '../src/lib/confidenza.ts'
import { etichettaAnni, etichettaAnniMundi, etichettaRange } from '../src/lib/pericopi.ts'
import {
  chiaveVersetto,
  etichettaVersetto,
  leggiVersettoId,
  nomeLibro,
  versettoDiParola,
} from '../src/lib/riferimenti.ts'

// ---------------------------------------------------------------------------
// Configurazione e argomenti
// ---------------------------------------------------------------------------

const DIR_DATI = path.join('public', 'data')
const DIR_OUT = 'export'

/** Percorso da mostrare nel documento: sempre con `/`, anche generando su Windows. */
function mostraPercorso(...parti: string[]): string {
  return parti.join('/').replaceAll('\\', '/')
}

const FLAG_SOLO = '--solo-da-verificare'
const argomenti = process.argv.slice(2)
const soloDaVerificare = argomenti.includes(FLAG_SOLO)
const ignoti = argomenti.filter((a) => a !== FLAG_SOLO)
if (ignoti.length > 0) {
  console.error(`export-dossier: argomento non riconosciuto: ${ignoti.join(', ')}`)
  console.error(`Uso: npx tsx scripts/export-dossier.ts [${FLAG_SOLO}]`)
  process.exit(1)
}

// Documenti diversi, nomi diversi: il dossier filtrato non deve sovrascrivere in silenzio
// quello completo.
const FILE_OUT = path.join(DIR_OUT, soloDaVerificare ? 'dossier-curation-da-verificare.md' : 'dossier-curation.md')

const errori: string[] = []
function err(dove: string, messaggio: string): void {
  errori.push(`${dove} — ${messaggio}`)
}

function fine(): never {
  console.error(`export-dossier: ${errori.length} errori — nessun file scritto.\n`)
  for (const e of errori) console.error(`  - ${e}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Lettura e validazione delle sorgenti
// ---------------------------------------------------------------------------

function leggiJson(relativo: string): unknown {
  const assoluto = path.join(DIR_DATI, relativo)
  if (!existsSync(assoluto)) {
    err(relativo, 'file assente in public/data/')
    return null
  }
  try {
    return JSON.parse(readFileSync(assoluto, 'utf8'))
  } catch (e) {
    err(relativo, `JSON non analizzabile: ${(e as Error).message}`)
    return null
  }
}

function etichettaRecord(el: unknown, i: number): string {
  return el !== null && typeof el === 'object' && typeof (el as Record<string, unknown>).id === 'string'
    ? String((el as Record<string, unknown>).id)
    : `record #${i}`
}

/** Valida un file-array; scarta i record non conformi accumulando gli errori. */
function validaArray<T>(relativo: string, grezzo: unknown, schema: z.ZodType<T>): T[] {
  if (grezzo === null) return []
  if (!Array.isArray(grezzo)) {
    err(relativo, 'atteso un array di record')
    return []
  }
  const validi: T[] = []
  grezzo.forEach((el, i) => {
    const r = schema.safeParse(el)
    if (r.success) validi.push(r.data)
    else for (const issue of r.error.issues) err(relativo, `${etichettaRecord(el, i)}: ${issue.path.join('.')} ${issue.message}`)
  })
  return validi
}

/** Valida un file-oggetto intero; null se non conforme. */
function validaOggetto<T>(relativo: string, grezzo: unknown, schema: z.ZodType<T>): T | null {
  if (grezzo === null) return null
  const r = schema.safeParse(grezzo)
  if (r.success) return r.data
  for (const issue of r.error.issues) err(relativo, `${issue.path.join('.')} ${issue.message}`)
  return null
}

const F_EVENTS = 'events.json'
const F_NOTES = 'notes.json'
const F_PLACES = 'places.json'
const F_PEOPLE = 'people.json'
const F_LEXICON = 'lexicon_it.json'
const F_LETTERALE = 'translations/letterale.json'
const F_MANIFEST = 'translations/index.json'

const eventi = validaArray(F_EVENTS, leggiJson(F_EVENTS), Evento)
const note = validaArray(F_NOTES, leggiJson(F_NOTES), Nota)
const luoghi = validaArray(F_PLACES, leggiJson(F_PLACES), Luogo)
const persone = validaArray(F_PEOPLE, leggiJson(F_PEOPLE), Persona)
const lexicon = validaOggetto(F_LEXICON, leggiJson(F_LEXICON), LexiconIt)
const letterale = validaOggetto(F_LETTERALE, leggiJson(F_LETTERALE), Traduzione)
const manifest = validaOggetto(F_MANIFEST, leggiJson(F_MANIFEST), ManifestTraduzioni)

if (errori.length > 0) fine()
// Da qui in poi i file-oggetto sono conformi: l'uscita anticipata li ha già garantiti.
const vociLexicon = Object.entries(lexicon as Record<string, VoceLexiconIt>)
const traduzioneLetterale = letterale as Traduzione
const manifestTraduzioni = manifest as ManifestTraduzioni

// ---------------------------------------------------------------------------
// Markdown: escape, ancore, righe
// ---------------------------------------------------------------------------

/** Escape inline: il testo curato è dato, non markup. */
function esc(s: string): string {
  return s.replace(/[\\`*_[\]<|]/g, (c) => `\\${c}`)
}

/**
 * Escape di un testo su più righe: oltre agli inline, neutralizza i caratteri che a
 * inizio riga aprirebbero un blocco (titolo, citazione, elenco, riga di setext).
 */
function escBlocco(s: string): string {
  return s
    .split('\n')
    .map((riga) => esc(riga).replace(/^(\s*)([#>+=-]|\d+\.)/, '$1\\$2'))
    .join('\n')
}

/** Campo ebraico in backtick: la bidirezionalità non deve sbandare sulla riga. */
function codice(s: string): string {
  const fence = s.includes('`') ? '``' : '`'
  const spazio = s.startsWith('`') || s.endsWith('`') ? ' ' : ''
  return `${fence}${spazio}${s}${spazio}${fence}`
}

/**
 * Slug in stile GitHub-Flavored Markdown, con dedup progressivo. Si applica al testo
 * NON escapato: nel documento reso il backslash non c'è, quindi ancora e intestazione
 * restano d'accordo.
 */
function creaSlugger(): (testo: string) => string {
  const visti = new Map<string, number>()
  return (testo: string): string => {
    const base = testo
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
    const n = visti.get(base) ?? 0
    visti.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }
}

const slug = creaSlugger()

/** Una riga del documento, con l'ancora quando è un'intestazione. */
interface Riga {
  testo: string
  ancora?: string
}

class Blocco {
  righe: Riga[] = []

  /** Intestazione: registra l'ancora e restituisce il suo id, per l'indice. */
  titolo(livello: number, testo: string): string {
    const ancora = slug(testo)
    this.vuota()
    this.righe.push({ testo: `${'#'.repeat(livello)} ${esc(testo)}`, ancora })
    this.righe.push({ testo: '' })
    return ancora
  }

  riga(testo: string): void {
    this.righe.push({ testo })
  }

  /** Evita di accumulare righe vuote consecutive: l'output resta pulito e diffabile. */
  vuota(): void {
    const ultima = this.righe[this.righe.length - 1]
    if (this.righe.length > 0 && ultima.testo !== '') this.righe.push({ testo: '' })
  }

  testo(): string {
    return this.righe.map((r) => r.testo).join('\n')
  }
}

/**
 * Campo breve, con l'assenza scritta a parole e mai un campo vuoto.
 * È una voce di elenco perché due righe adiacenti, in Markdown, si fondono in una riga
 * sola quando il documento viene reso: i campi finirebbero incolonnati di traverso.
 * Le righe di continuazione rientrano di due spazi, così un valore su più righe resta
 * dentro la sua voce.
 */
function campo(blocco: Blocco, etichetta: string, valore: string | null, assenza: string): void {
  const v = valore !== null && valore !== '' ? valore : `*${esc(assenza)}*`
  blocco.riga(`- **${etichetta}:** ${v.split('\n').join('\n  ')}`)
}

/**
 * Campo di prosa lunga (sintesi, note, testi): etichetta su una riga, testo come
 * paragrafo a sé. Un muro di testo dentro una voce di elenco si legge male su carta.
 */
function campoProsa(blocco: Blocco, etichetta: string, testo: string | null, assenza: string): void {
  blocco.vuota()
  blocco.riga(`**${etichetta}**`)
  blocco.vuota()
  blocco.riga(testo !== null && testo !== '' ? escBlocco(testo) : `*${esc(assenza)}*`)
  blocco.vuota()
}

/** Confidenza sempre con etichetta testuale, mai col solo codice o col solo segno. */
function rendiConfidenza(c: Confidenza): string {
  return `${esc(ETICHETTA_CONFIDENZA[c])} (\`${c}\`) — ${esc(GLOSSA_CONFIDENZA[c])}`
}

function rigaFonte(f: Fonte): string {
  const parti: string[] = []
  if (f.autore) parti.push(`${esc(f.autore)},`)
  parti.push(`«${esc(f.titolo)}»`)
  if (f.anno !== undefined) parti.push(`(${f.anno})`)
  let riga = `- [${f.tipo}] ${parti.join(' ')}`
  if (f.url) riga += ` — <${f.url}>`
  if (f.dettaglio) riga += `\n  ${esc(f.dettaglio)}`
  return riga
}

function rendiFonti(blocco: Blocco, etichetta: string, fonti: readonly Fonte[], assenza: string): void {
  blocco.vuota()
  if (fonti.length === 0) {
    blocco.riga(`**${etichetta}:** *${esc(assenza)}*`)
    blocco.vuota()
    return
  }
  blocco.riga(`**${etichetta}:**`)
  blocco.vuota()
  for (const f of fonti) blocco.riga(rigaFonte(f))
  blocco.vuota()
}

function rendiDaVerificare(blocco: Blocco, flag: boolean): void {
  blocco.vuota()
  blocco.riga(flag ? '**Da verificare:** sì (in attesa della passata F5.3)' : '**Da verificare:** no')
  blocco.vuota()
}

function elencoVersetti(riferimenti: readonly string[]): string | null {
  return riferimenti.length === 0 ? null : riferimenti.map((r) => esc(etichettaVersetto(r))).join(' · ')
}

// ---------------------------------------------------------------------------
// Risoluzione degli id e ordinamento canonico
// ---------------------------------------------------------------------------

const perIdLuogo = new Map(luoghi.map((l) => [l.id, l]))
const perIdPersona = new Map(persone.map((p) => [p.id, p]))

/**
 * Nome leggibile di un'entità: l'italiano quando c'è, altrimenti la traslitterazione,
 * altrimenti l'id nudo. Non si inventa un nome: dove `nomi.it` è vuoto (entità fuori dai
 * range curati) lo si dichiara.
 */
function nomeEntita(nomi: Nomi | undefined, id: string): string {
  if (!nomi) return `\`${id}\` (assente dai file curati)`
  if (nomi.it) return `${esc(nomi.it)} (\`${id}\`)`
  if (nomi.translit) return `${esc(nomi.translit)} (\`${id}\`, senza nome italiano)`
  return `\`${id}\` (senza nome)`
}

function nomeLuogo(id: string): string {
  return nomeEntita(perIdLuogo.get(id)?.nomi, id)
}

function nomePersona(id: string): string {
  return nomeEntita(perIdPersona.get(id)?.nomi, id)
}

/** Il versetto su cui una nota si colloca nell'ordine canonico. */
function ancoraNota(n: Nota): string | null {
  switch (n.target.tipo) {
    case 'versetto':
      return n.target.ref
    case 'pericope':
      return n.target.ref.da
    case 'parola':
      return versettoDiParola(n.target.ref)
    case 'luogo':
      return perIdLuogo.get(n.target.ref)?.riferimenti[0] ?? null
    case 'persona':
      return perIdPersona.get(n.target.ref)?.riferimenti[0] ?? null
  }
}

/** Target di una nota in forma leggibile: che cosa la nota annota. */
function rendiTarget(n: Nota): string {
  switch (n.target.tipo) {
    case 'versetto':
      return `versetto — ${esc(etichettaVersetto(n.target.ref))}`
    case 'pericope':
      return `pericope — ${esc(etichettaRange(n.target.ref.da, n.target.ref.a))}`
    case 'parola':
      return `parola — \`${n.target.ref}\` (${esc(etichettaVersetto(versettoDiParola(n.target.ref)))})`
    case 'luogo':
      return `luogo — ${nomeLuogo(n.target.ref)}`
    case 'persona':
      return `persona — ${nomePersona(n.target.ref)}`
  }
}

const ETICHETTA_TIPO_NOTA: Record<Nota['tipo'], string> = {
  filologica: 'filologica',
  storica: 'storica',
  geografica: 'geografica',
  tradizione_ebraica: 'tradizione ebraica',
  divergenza_traduttiva: 'divergenza traduttiva',
}

/**
 * Divide una collezione in «collocabile sull'asse canonico» e «senza riferimento
 * risolvibile», ordinando la prima parte. L'ordinamento è stabile: a parità di versetto
 * resta l'ordine del file, cioè quello della curation.
 */
function ordinaCanonico<T>(record: readonly T[], riferimento: (r: T) => string | null): { ordinati: T[]; senza: T[] } {
  const ordinati: { r: T; k: number }[] = []
  const senza: T[] = []
  for (const r of record) {
    const rif = riferimento(r)
    const k = rif === null ? null : chiaveVersetto(rif)
    if (k === null) senza.push(r)
    else ordinati.push({ r, k })
  }
  ordinati.sort((a, b) => a.k - b.k)
  return { ordinati: ordinati.map((o) => o.r), senza }
}

// ---------------------------------------------------------------------------
// Filtro --solo-da-verificare
// ---------------------------------------------------------------------------

function filtra<T extends { da_verificare: boolean }>(record: readonly T[]): T[] {
  return soloDaVerificare ? record.filter((r) => r.da_verificare) : [...record]
}

const eventiScelti = filtra(eventi)
const noteScelte = filtra(note)
const luoghiScelti = filtra(luoghi)
const personeScelte = filtra(persone)
const lexiconScelto = soloDaVerificare ? vociLexicon.filter(([, v]) => v.da_verificare) : vociLexicon

// ---------------------------------------------------------------------------
// Sezioni: un record per intestazione
// ---------------------------------------------------------------------------

/** Voce dell'indice dei `da_verificare`: quel che serve a ritrovare il record, anche su carta. */
interface VoceIndice {
  etichetta: string
  id: string
  ancora: string
}

const indice: Record<string, VoceIndice[]> = {
  events: [],
  notes: [],
  places: [],
  people: [],
  lexicon: [],
}

function registraIndice(collezione: string, flag: boolean, etichetta: string, id: string, ancora: string): void {
  if (flag) indice[collezione].push({ etichetta, id, ancora })
}

// --- events ---------------------------------------------------------------

function rendiEvento(blocco: Blocco, e: Evento): void {
  const etichetta = `${etichettaRange(e.range.da, e.range.a)} — ${e.titolo}`
  const ancora = blocco.titolo(3, etichetta)
  registraIndice('events', e.da_verificare, etichetta, e.id, ancora)

  blocco.riga(`\`${e.id}\` · pericope \`${e.range.da}\`–\`${e.range.a}\``)
  blocco.vuota()

  campo(
    blocco,
    'Persone',
    e.persone.length > 0 ? e.persone.map(nomePersona).join(' · ') : null,
    'nessuna persona collegata alla pericope',
  )
  campo(
    blocco,
    'Luoghi',
    e.luoghi.length > 0 ? e.luoghi.map(nomeLuogo).join(' · ') : null,
    'nessun luogo collegato alla pericope',
  )

  // I tre assi restano tre blocchi separati, con le loro etichette e le loro unità di
  // conto: non c'è e non deve esserci una linea temporale unica (specifica §3.3).
  blocco.titolo(4, 'Tempo narrato — cronologia interna del racconto (Anno Mundi)')
  campo(blocco, 'Collocazione', etichettaAnniMundi(e.tempo_narrato.am), 'nessuna collocazione in Anno Mundi')
  campo(
    blocco,
    'Riferimenti interni',
    elencoVersetti(e.tempo_narrato.riferimenti_interni),
    'nessun riferimento interno di cronologia',
  )
  blocco.vuota()
  blocco.riga('*Questo asse non porta confidenza: è dato testuale, non affermazione storica.*')
  campoProsa(blocco, 'Nota di cronologia', e.tempo_narrato.nota, 'nessuna nota di cronologia')

  blocco.titolo(4, 'Tempo storico-critico — ancoraggio nella storia')
  campo(blocco, 'Ancoraggio', etichettaAnni(e.tempo_storico.ancoraggio), 'nessun ancoraggio storico')
  campo(blocco, 'Confidenza', rendiConfidenza(e.tempo_storico.confidence), '—')
  campoProsa(blocco, 'Sintesi', e.tempo_storico.sintesi, 'nessuna sintesi')
  rendiFonti(blocco, 'Fonti dell’ancoraggio', e.tempo_storico.fonti, 'nessuna fonte citata')

  blocco.titolo(4, 'Composizione dei testi — datazione e redazione')
  campo(blocco, 'Forbice del dibattito', etichettaAnni(e.composizione.range), 'nessuna forbice indicata')
  if (e.composizione.posizioni.length === 0) {
    blocco.riga('*Nessuna posizione registrata.*')
    blocco.vuota()
  } else
    e.composizione.posizioni.forEach((p, i) => {
      blocco.vuota()
      blocco.riga(`**Posizione ${i + 1} — ${esc(p.etichetta)}**`)
      blocco.vuota()
      blocco.riga(escBlocco(p.sintesi))
      rendiFonti(blocco, 'Fonti della posizione', p.fonti, 'nessuna fonte citata')
    })

  rendiFonti(blocco, 'Fonti della pericope', e.fonti, 'nessuna fonte citata')
  rendiDaVerificare(blocco, e.da_verificare)
}

// --- notes ----------------------------------------------------------------

function rendiNota(blocco: Blocco, n: Nota): void {
  const rif = ancoraNota(n)
  const etichetta = `${rif ? etichettaVersetto(rif) : 'senza riferimento'} — ${n.titolo}`
  const ancora = blocco.titolo(3, etichetta)
  registraIndice('notes', n.da_verificare, etichetta, n.id, ancora)

  blocco.riga(`\`${n.id}\``)
  blocco.vuota()

  campo(blocco, 'Tipo', esc(ETICHETTA_TIPO_NOTA[n.tipo]) + ` (\`${n.tipo}\`)`, '—')
  campo(blocco, 'Ancoraggio', rendiTarget(n), '—')
  campo(blocco, 'Confidenza', rendiConfidenza(n.confidence), '—')
  // Commentatore e sefaria_ref esistono solo sulle note della tradizione ebraica: la
  // prospettiva resta etichettata e distinta da quella storico-critica (specifica §3.5).
  if (n.tipo === 'tradizione_ebraica' || n.commentatore || n.sefaria_ref) {
    campo(blocco, 'Commentatore', n.commentatore ? esc(n.commentatore) : null, 'nessun commentatore indicato')
    campo(blocco, 'Riferimento Sefaria', n.sefaria_ref ? codice(n.sefaria_ref) : null, 'nessun riferimento Sefaria')
  }

  campoProsa(blocco, 'Testo della nota', n.testo, 'nessun testo')
  rendiFonti(blocco, 'Fonti', n.fonti, 'nessuna fonte citata')
  rendiDaVerificare(blocco, n.da_verificare)
}

// --- places ---------------------------------------------------------------

function rendiLuogo(blocco: Blocco, l: Luogo): void {
  const primo = l.riferimenti[0]
  const nome = l.nomi.it || l.nomi.translit || l.id
  const etichetta = `${nome} — ${primo ? etichettaVersetto(primo) : 'senza riferimento'}`
  const ancora = blocco.titolo(3, etichetta)
  registraIndice('places', l.da_verificare, etichetta, l.id, ancora)

  blocco.riga(`\`${l.id}\`${l.tipnr_id ? ` · TIPNR \`${l.tipnr_id}\`` : ' · nessuna corrispondenza TIPNR'}`)
  blocco.vuota()

  campo(blocco, 'Nome italiano', l.nomi.it ? esc(l.nomi.it) : null, 'non ancora curato')
  campo(blocco, 'Ebraico', l.nomi.he ? codice(l.nomi.he) : null, 'nessuna forma ebraica')
  campo(blocco, 'Traslitterazione', l.nomi.translit ? esc(l.nomi.translit) : null, 'nessuna traslitterazione')
  campo(blocco, 'Status', rendiConfidenza(l.status), '—')

  blocco.vuota()
  if (l.candidati.length === 0) {
    blocco.riga('**Candidati di localizzazione:** *nessun candidato di localizzazione*')
    blocco.vuota()
  } else {
    blocco.riga(`**Candidati di localizzazione:** ${l.candidati.length}`)
    l.candidati.forEach((c, i) => {
      blocco.vuota()
      blocco.riga(`**Candidato ${i + 1} — ${esc(c.etichetta)}**`)
      blocco.vuota()
      campo(blocco, 'Id', `\`${c.id}\``, '—')
      campo(blocco, 'Coordinate', `${c.lat}, ${c.lon}`, '—')
      // `peso_openbible` assente non è zero: è «questo candidato non sta nel dataset
      // OpenBible». Un punteggio non si inventa (SCHEMI-DATI §2.3).
      campo(
        blocco,
        'Peso OpenBible',
        c.peso_openbible !== undefined ? String(c.peso_openbible) : null,
        'candidato non presente nel dataset OpenBible',
      )
      if (c.pro.length > 0) for (const p of c.pro) campo(blocco, 'Pro', escBlocco(p), '—')
      else campo(blocco, 'Pro', null, 'nessun argomento a favore registrato')
      if (c.contro.length > 0) for (const p of c.contro) campo(blocco, 'Contro', escBlocco(p), '—')
      else campo(blocco, 'Contro', null, 'nessun argomento contrario registrato')
      rendiFonti(blocco, 'Fonti del candidato', c.fonti, 'nessuna fonte citata')
    })
  }

  blocco.vuota()
  campo(blocco, 'Riferimenti', elencoVersetti(l.riferimenti), 'nessun riferimento nel Pentateuco')
  rendiFonti(blocco, 'Fonti del luogo', l.fonti, 'nessuna fonte citata')
  rendiDaVerificare(blocco, l.da_verificare)
}

// --- people ---------------------------------------------------------------

function rendiPersona(blocco: Blocco, p: Persona): void {
  const primo = p.riferimenti[0]
  const nome = p.nomi.it || p.nomi.translit || p.id
  const etichetta = `${nome} — ${primo ? etichettaVersetto(primo) : 'senza riferimento'}`
  const ancora = blocco.titolo(3, etichetta)
  registraIndice('people', p.da_verificare, etichetta, p.id, ancora)

  blocco.riga(`\`${p.id}\`${p.tipnr_id ? ` · TIPNR \`${p.tipnr_id}\`` : ' · nessuna corrispondenza TIPNR'}`)
  blocco.vuota()

  campo(blocco, 'Nome italiano', p.nomi.it ? esc(p.nomi.it) : null, 'non ancora curato')
  campo(blocco, 'Ebraico', p.nomi.he ? codice(p.nomi.he) : null, 'nessuna forma ebraica')
  campo(blocco, 'Traslitterazione', p.nomi.translit ? esc(p.nomi.translit) : null, 'nessuna traslitterazione')

  blocco.vuota()
  blocco.riga('**Relazioni familiari**')
  blocco.vuota()
  campo(blocco, 'Padre', p.relazioni.padre ? nomePersona(p.relazioni.padre) : null, 'nessun padre registrato')
  campo(blocco, 'Madre', p.relazioni.madre ? nomePersona(p.relazioni.madre) : null, 'nessuna madre registrata')
  campo(
    blocco,
    'Coniugi',
    p.relazioni.coniugi.length > 0 ? p.relazioni.coniugi.map(nomePersona).join(' · ') : null,
    'nessun coniuge registrato',
  )
  campo(
    blocco,
    'Figli',
    p.relazioni.figli.length > 0 ? p.relazioni.figli.map(nomePersona).join(' · ') : null,
    'nessun figlio registrato',
  )

  blocco.vuota()
  blocco.riga('**Età nel racconto** — cifre letterali del TM, dato narrativo e non storico')
  blocco.vuota()
  if (!p.dati_narrativi) {
    blocco.riga('*Il TM non dà età letterali per questa figura.*')
    blocco.vuota()
  } else {
    campo(
      blocco,
      'Età totale',
      p.dati_narrativi.eta_totale !== null ? `${p.dati_narrativi.eta_totale} anni` : null,
      'non data dal testo',
    )
    campo(
      blocco,
      'Età al primo figlio',
      p.dati_narrativi.eta_al_primo_figlio !== null ? `${p.dati_narrativi.eta_al_primo_figlio} anni` : null,
      'non data dal testo',
    )
    campo(
      blocco,
      'Versetti delle cifre',
      elencoVersetti(p.dati_narrativi.versetti),
      'nessun versetto registrato per le cifre',
    )
  }

  blocco.vuota()
  campo(blocco, 'Riferimenti', elencoVersetti(p.riferimenti), 'nessun riferimento nel Pentateuco')
  rendiFonti(blocco, 'Fonti', p.fonti, 'nessuna fonte citata')
  rendiDaVerificare(blocco, p.da_verificare)
}

// --- lexicon --------------------------------------------------------------

function rendiVoceLexicon(blocco: Blocco, chiave: string, v: VoceLexiconIt): void {
  const ancora = blocco.titolo(3, chiave)
  registraIndice('lexicon', v.da_verificare, chiave, chiave, ancora)
  campo(blocco, 'Glossa italiana', v.glossa_it ? esc(v.glossa_it) : null, 'nessuna glossa')
  rendiFonti(blocco, 'Fonti', v.fonti, 'nessuna fonte citata')
  rendiDaVerificare(blocco, v.da_verificare)
}

// ---------------------------------------------------------------------------
// Corpo del documento
// ---------------------------------------------------------------------------

const corpo = new Blocco()

function rendiSezione<T>(
  titolo: string,
  file: string,
  record: readonly T[],
  riferimento: (r: T) => string | null,
  rendi: (b: Blocco, r: T) => void,
  vuota: string,
): void {
  const { ordinati, senza } = ordinaCanonico(record, riferimento)
  corpo.titolo(2, `${titolo} — ${file}`)
  corpo.riga(`${record.length} record, in ordine canonico sul primo riferimento biblico.`)
  corpo.vuota()
  if (record.length === 0) {
    corpo.riga(`*${esc(vuota)}*`)
    corpo.vuota()
  }
  for (const r of ordinati) rendi(corpo, r)
  if (senza.length > 0) {
    corpo.titolo(2, `${titolo} senza riferimento canonico`)
    corpo.riga(
      `${senza.length} record il cui primo riferimento biblico non è risolvibile: restano in coda, non collocati.`,
    )
    corpo.vuota()
    for (const r of senza) rendi(corpo, r)
  }
}

rendiSezione(
  'Pericopi',
  F_EVENTS,
  eventiScelti,
  (e) => e.range.da,
  rendiEvento,
  'Nessuna pericope da mostrare con questo filtro.',
)
rendiSezione('Note', F_NOTES, noteScelte, ancoraNota, rendiNota, 'Nessuna nota da mostrare con questo filtro.')
rendiSezione(
  'Luoghi',
  F_PLACES,
  luoghiScelti,
  (l) => l.riferimenti[0] ?? null,
  rendiLuogo,
  'Nessun luogo da mostrare con questo filtro.',
)
rendiSezione(
  'Persone',
  F_PEOPLE,
  personeScelte,
  (p) => p.riferimenti[0] ?? null,
  rendiPersona,
  'Nessuna persona da mostrare con questo filtro.',
)

// Il lessico è l'unica collezione senza riferimento canonico: si ordina per chiave
// dStrong, che è la sua chiave naturale (SCHEMI-DATI §2.9).
corpo.titolo(2, `Glosse italiane per lemma — ${F_LEXICON}`)
corpo.riga(`${lexiconScelto.length} voci, in ordine di chiave dStrong (il lessico non ha riferimento canonico).`)
corpo.vuota()
if (lexiconScelto.length === 0) {
  corpo.riga('*Nessuna glossa da mostrare con questo filtro.*')
  corpo.vuota()
}
for (const [chiave, v] of [...lexiconScelto].sort((a, b) => a[0].localeCompare(b[0], 'en'))) {
  rendiVoceLexicon(corpo, chiave, v)
}

// --- letterale ------------------------------------------------------------

corpo.titolo(2, `Traduzione letterale — ${F_LETTERALE}`)
if (soloDaVerificare) {
  corpo.riga(
    'La traduzione letterale non porta un flag `da_verificare` per versetto: lo schema non lo prevede, ' +
      'perché ogni pericope è stata approvata in sessione. La sezione è quindi omessa in modalità ' +
      `\`${FLAG_SOLO}\`; il dossier completo la riporta per intero.`,
  )
  corpo.vuota()
} else {
  const m = traduzioneLetterale.meta
  campo(corpo, 'Nome', esc(m.nome), '—')
  campo(corpo, 'Anno', m.anno !== null ? String(m.anno) : null, 'nessun anno di pubblicazione')
  campo(corpo, 'Lingua', esc(m.lingua), '—')
  campo(corpo, 'Licenza', esc(m.licenza), '—')
  campo(corpo, 'Copertura', m.completa ? 'tutto il Pentateuco' : 'solo i capitoli curati', '—')
  if (m.note && m.note.length > 0) {
    corpo.vuota()
    corpo.riga('**Convenzioni dichiarate nel file**')
    corpo.vuota()
    for (const nota of m.note) corpo.riga(`- ${escBlocco(nota)}`)
    corpo.vuota()
  }
  if (m.fonti && m.fonti.length > 0) rendiFonti(corpo, 'Fonti', m.fonti, 'nessuna fonte citata')

  const chiavi = Object.keys(traduzioneLetterale.testi)
    .map((k) => ({ k, ord: chiaveVersetto(k) }))
    .filter((x) => x.ord !== null)
    .sort((a, b) => (a.ord as number) - (b.ord as number))

  corpo.vuota()
  corpo.riga(`${chiavi.length} versetti, testo verbatim dal file.`)
  corpo.vuota()

  let capitoloCorrente = ''
  for (const { k } of chiavi) {
    const rif = leggiVersettoId(k)
    if (!rif) continue
    const capitolo = `${rif.libro}.${rif.capitolo}`
    if (capitolo !== capitoloCorrente) {
      capitoloCorrente = capitolo
      corpo.titolo(3, `${nomeLibro(rif.libro)} ${rif.capitolo}`)
    }
    corpo.riga(`**${rif.versetto}.** ${escBlocco(traduzioneLetterale.testi[k])}`)
    corpo.riga('')
  }

  // Versetti con chiave fuori dal Pentateuco: non dovrebbero esistere (il validatore li
  // rifiuta), ma se ci fossero vanno detti, non persi in silenzio.
  const fuori = Object.keys(traduzioneLetterale.testi).filter((k) => chiaveVersetto(k) === null)
  if (fuori.length > 0) {
    corpo.titolo(3, 'Versetti senza riferimento canonico')
    for (const k of fuori) corpo.riga(`- \`${k}\`: ${escBlocco(traduzioneLetterale.testi[k])}`)
    corpo.vuota()
  }
}

// ---------------------------------------------------------------------------
// Testa: intestazione, conteggi, indice dei da_verificare
// ---------------------------------------------------------------------------

const testa = new Blocco()
const oggi = new Date().toISOString().slice(0, 10)

testa.riga('# Dossier della curation — Pentateuco in contesto')
testa.vuota()
testa.riga(`Generato il ${oggi} da \`scripts/export-dossier.ts\`.`)
testa.vuota()
testa.riga(
  soloDaVerificare
    ? `Modalità **${FLAG_SOLO}**: solo i record con \`da_verificare: true\`.`
    : 'Modalità **completa**: tutti i record curati.',
)
testa.vuota()
testa.riga(
  'Resa leggibile dei soli file **curati `[C]`** di `public/data/`. Nessun contenuto è generato qui: ' +
    'ogni campo è copiato verbatim dai JSON, comprese le sintesi, le note e la traduzione letterale. ' +
    'Le uniche parole aggiunte sono le etichette dei campi e le frasi che dichiarano un’assenza. ' +
    'I file generati `[G]` (testo ebraico, morfologia, rimandi, indici, Luzzi, embeddings) restano fuori: ' +
    'sono rigenerabili dagli script di import e non sono lavoro di curation.',
)
testa.vuota()
testa.riga(
  'I tre assi temporali di ogni pericope sono resi come tre blocchi distinti — tempo narrato, ' +
    'tempo storico-critico, composizione — e non vanno letti come una linea sola: il narrato conta in ' +
    'Anno Mundi, gli altri due in era cristiana. La confidenza è sempre scritta per esteso, con il suo ' +
    'codice e la sua glossa; la prospettiva della tradizione ebraica resta etichettata come tale e ' +
    'distinta da quella storico-critica.',
)
testa.vuota()

testa.titolo(2, 'Sorgenti e conteggi')
testa.riga(`- \`${mostraPercorso(DIR_DATI, F_EVENTS)}\` — ${eventi.length} pericopi`)
testa.riga(`- \`${mostraPercorso(DIR_DATI, F_NOTES)}\` — ${note.length} note`)
testa.riga(`- \`${mostraPercorso(DIR_DATI, F_PLACES)}\` — ${luoghi.length} luoghi`)
testa.riga(`- \`${mostraPercorso(DIR_DATI, F_PEOPLE)}\` — ${persone.length} persone`)
testa.riga(`- \`${mostraPercorso(DIR_DATI, F_LEXICON)}\` — ${vociLexicon.length} glosse per lemma`)
testa.riga(
  `- \`${mostraPercorso(DIR_DATI, F_LETTERALE)}\` — ${Object.keys(traduzioneLetterale.testi).length} versetti tradotti`,
)
testa.riga(
  `- \`${mostraPercorso(DIR_DATI, F_MANIFEST)}\` — manifest, traduzioni installate: ${manifestTraduzioni.disponibili
    .map((d) => `\`${d}\``)
    .join(', ')} (qui entra solo \`letterale\`, l’unica \`[C]\`)`,
)
testa.vuota()

if (soloDaVerificare) {
  testa.riga(
    'Con il filtro attivo i record mostrati sono: ' +
      `${eventiScelti.length} pericopi, ${noteScelte.length} note, ${luoghiScelti.length} luoghi, ` +
      `${personeScelte.length} persone, ${lexiconScelto.length} glosse.`,
  )
  testa.vuota()
}

testa.titolo(2, 'Indice dei record da verificare')
const totaleDaVerificare =
  indice.events.length + indice.notes.length + indice.places.length + indice.people.length + indice.lexicon.length
testa.riga(
  `${totaleDaVerificare} record portano \`da_verificare: true\` e attendono la passata F5.3. ` +
    'Ogni voce porta riferimento, titolo e id: sono gli stessi che compaiono nell’intestazione del ' +
    'record, così l’indice resta navigabile anche su carta, dove il link non funziona.',
)
testa.vuota()
testa.riga(
  'La traduzione letterale non compare in questo indice: il suo schema non prevede un flag per versetto, ' +
    'perché è stata approvata pericope per pericope in sessione.',
)
testa.vuota()

const GRUPPI: { chiave: string; titolo: string }[] = [
  { chiave: 'events', titolo: 'Pericopi da verificare' },
  { chiave: 'notes', titolo: 'Note da verificare' },
  { chiave: 'places', titolo: 'Luoghi da verificare' },
  { chiave: 'people', titolo: 'Persone da verificare' },
  { chiave: 'lexicon', titolo: 'Glosse da verificare' },
]

for (const g of GRUPPI) {
  const voci = indice[g.chiave]
  testa.titolo(3, `${g.titolo} (${voci.length})`)
  if (voci.length === 0) {
    testa.riga('*Nessun record da verificare in questa collezione.*')
    testa.vuota()
    continue
  }
  for (const v of voci) testa.riga(`- [${esc(v.etichetta)}](#${v.ancora}) · \`${v.id}\``)
  testa.vuota()
}

// ---------------------------------------------------------------------------
// Scrittura
// ---------------------------------------------------------------------------

if (!existsSync(DIR_OUT)) mkdirSync(DIR_OUT, { recursive: true })
const documento = `${testa.testo()}\n${corpo.testo()}\n`
writeFileSync(FILE_OUT, documento, 'utf8')

const righe = documento.split('\n').length
console.log(`export-dossier: scritto ${FILE_OUT}`)
console.log(`  modalità: ${soloDaVerificare ? FLAG_SOLO : 'completa'}`)
console.log(
  `  record resi: ${eventiScelti.length} pericopi, ${noteScelte.length} note, ${luoghiScelti.length} luoghi, ` +
    `${personeScelte.length} persone, ${lexiconScelto.length} glosse` +
    (soloDaVerificare ? '' : `, ${Object.keys(traduzioneLetterale.testi).length} versetti della letterale`),
)
console.log(`  da verificare in indice: ${totaleDaVerificare}`)
console.log(`  ${righe} righe, ${(documento.length / 1024).toFixed(0)} KB`)
