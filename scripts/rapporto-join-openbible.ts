// scripts/rapporto-join-openbible.ts — rapporto di istruttoria, NON un importatore.
//
// Confronta il criterio con cui i candidati OpenBible sono oggi in
// public/data/places.json con un criterio alternativo, e scrive solo un rapporto.
//
// LO SCRIPT NON SCRIVE MAI IN public/data/ NÉ IN bootstrap/, e non tocca
// curation-override.json. L'unica uscita è export/rapporto-join-openbible.md.
// È volutamente separato da import-tipnr.ts: finché la decisione sulla
// rigenerazione è aperta, il criterio nuovo non deve poter finire per sbaglio
// nel percorso che riscrive un file curato. Quando la decisione sarà presa, il
// criterio va portato dentro import-tipnr.ts e questo file cancellato.
//
// IL CRITERIO IN ESAME
// --------------------
// Oggi, quando più voci OpenBible rivendicano lo stesso id TIPNR, la contesa si
// risolve sulla colonna "OpenBible name" di TIPNR (e, se non discrimina, sulla
// prima voce incontrata, cioè sull'ordine del file). Il criterio alternativo la
// risolve sulla sovrapposizione fra i `riferimenti` del nostro record e il campo
// `verses` della voce OpenBible: entrambe le sorgenti dicono a quali versetti si
// riferiscono, ed è un dato, non l'ordine di un file.
//
// ATTENZIONE, limite strutturale misurato nel rapporto: i nostri `riferimenti`
// vengono da TIPNR e sono filtrati al Pentateuco, mentre `verses` copre tutta la
// Bibbia. Il confronto va quindi fatto sulla copertura dei NOSTRI riferimenti da
// parte della voce, non sull'intersezione simmetrica, che penalizzerebbe le voci
// con molti versetti fuori dal Pentateuco.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'

const RADICE = path.resolve(import.meta.dirname, '..')
const SORGENTE_OPENBIBLE = path.join(RADICE, 'scripts/sources/Bible-Geocoding-Data-main/data/ancient.jsonl')
const PLACES = path.join(RADICE, 'public/data/places.json')
const USCITA = path.join(RADICE, 'export/rapporto-join-openbible.md')
const CHIAVE_TIPNR_IN_OPENBIBLE = 's3b25cf'

// Libri OSIS del Pentateuco → nostri codici. Gli altri libri non ci interessano:
// i nostri riferimenti non li contengono (TIPNR è filtrato al Pentateuco).
const LIBRI_OSIS: Record<string, string> = { Gen: 'gen', Exod: 'exo', Lev: 'lev', Num: 'num', Deut: 'deu' }

interface Candidato {
  id: string
  etichetta: string
  lat: number
  lon: number
  peso_openbible: number | null
}
interface Luogo {
  id: string
  tipnr_id: string | null
  nomi: { it: string; he: string; translit: string }
  status: string
  candidati: Candidato[]
  riferimenti: string[]
  fonti: { tipo: string }[]
  da_verificare: boolean
}
interface VoceOb {
  id: string
  url_slug: string
  friendly_id: string
  /** Riferimenti del Pentateuco dichiarati dalla voce, nei nostri id. */
  versettiPent: Set<string>
  /** Totale dei versetti della voce, Pentateuco o no: serve a dire quanto è ampia. */
  versettiTotali: number
  identificazioni: { id: string; punteggio: number | null }[]
}

// ---------------------------------------------------------------------------
// Caricamento
// ---------------------------------------------------------------------------

function osisANostro(osis: string): string | null {
  const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/.exec(osis)
  if (!m) return null
  const libro = LIBRI_OSIS[m[1]]
  return libro ? `${libro}.${Number(m[2])}.${Number(m[3])}` : null
}

function caricaOpenBible(): { perTipnr: Map<string, VoceOb[]>; nomi: Map<string, string> } {
  const perTipnr = new Map<string, VoceOb[]>()
  const nomi = new Map<string, string>()
  for (const riga of readFileSync(SORGENTE_OPENBIBLE, 'utf8').split(/\r?\n/)) {
    if (riga.trim() === '') continue
    const o = JSON.parse(riga) as {
      id?: string
      url_slug?: string
      friendly_id?: string
      verses?: { osis?: string }[]
      identifications?: { id?: string; score?: { time_total?: number } }[]
      linked_data?: Record<string, { id?: string; ids?: string[] }>
    }
    if (o.id) nomi.set(o.id, o.friendly_id ?? o.url_slug ?? o.id)
    const versettiPent = new Set<string>()
    for (const v of o.verses ?? []) {
      const nostro = v.osis ? osisANostro(v.osis) : null
      if (nostro) versettiPent.add(nostro)
    }
    const voce: VoceOb = {
      id: o.id ?? '',
      url_slug: o.url_slug ?? '',
      friendly_id: o.friendly_id ?? o.url_slug ?? '',
      versettiPent,
      versettiTotali: (o.verses ?? []).length,
      identificazioni: (o.identifications ?? []).map((i) => ({ id: i.id ?? '?', punteggio: i.score?.time_total ?? null })),
    }
    const collegamento = o.linked_data?.[CHIAVE_TIPNR_IN_OPENBIBLE]
    if (!collegamento) continue
    for (const id of collegamento.ids ?? (collegamento.id ? [collegamento.id] : [])) {
      const lista = perTipnr.get(id)
      if (lista) lista.push(voce)
      else perTipnr.set(id, [voce])
    }
  }
  return { perTipnr, nomi }
}

/** L'id TIPNR in linked_data è senza suffisso di libro e senza Strong. */
function chiaveOb(tipnrId: string): string {
  return tipnrId.replace(/=.*$/, '').replace(/-[A-Za-z0-9]+$/, '')
}

const luoghi = JSON.parse(readFileSync(PLACES, 'utf8')) as Luogo[]
const { perTipnr, nomi: nomiOb } = caricaOpenBible()

// ---------------------------------------------------------------------------
// Analisi
// ---------------------------------------------------------------------------

type Esito = {
  luogo: Luogo
  voci: VoceOb[]
  /** Copertura dei nostri riferimenti da parte di ciascuna voce. */
  coperture: { voce: VoceOb; coperti: number; quota: number }[]
  vincitriceNuova: VoceOb | null
  pareggio: boolean
  copertutaZeroOvunque: boolean
  /** La voce che ha prodotto i candidati oggi presenti, dedotta dai candidati stessi. */
  vinciteceAttuale: VoceOb | null
  cambia: boolean
}

/** Deduce la voce OpenBible da cui vengono i candidati oggi nel record. */
function voceAttuale(luogo: Luogo, voci: VoceOb[]): VoceOb | null {
  if (luogo.candidati.length === 0) return null
  const idCandidati = new Set(luogo.candidati.map((c) => c.id.replace(/^.*?\./, '').replace(/-\d+$/, '')))
  let migliore: VoceOb | null = null
  let max = -1
  for (const v of voci) {
    // I candidati portano nell'id lo slug dell'identificazione OpenBible.
    const suoi = v.identificazioni.filter((i) => idCandidati.has(i.id) || idCandidati.has((nomiOb.get(i.id) ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')))
    if (suoi.length > max) {
      max = suoi.length
      migliore = v
    }
  }
  // Ripiego: se il conteggio delle identificazioni combacia con una sola voce, è quella.
  if (max <= 0) {
    const perNumero = voci.filter((v) => v.identificazioni.length === luogo.candidati.length)
    if (perNumero.length === 1) return perNumero[0]
    return null
  }
  return migliore
}

const esiti: Esito[] = []
for (const luogo of luoghi) {
  if (!luogo.tipnr_id) {
    esiti.push({
      luogo,
      voci: [],
      coperture: [],
      vincitriceNuova: null,
      pareggio: false,
      copertutaZeroOvunque: false,
      vinciteceAttuale: null,
      cambia: false,
    })
    continue
  }
  const voci = perTipnr.get(chiaveOb(luogo.tipnr_id)) ?? []
  const miei = new Set(luogo.riferimenti)
  const coperture = voci
    .map((voce) => {
      let coperti = 0
      for (const r of miei) if (voce.versettiPent.has(r)) coperti++
      return { voce, coperti, quota: miei.size === 0 ? 0 : coperti / miei.size }
    })
    .sort((a, b) => b.coperti - a.coperti || b.voce.identificazioni.length - a.voce.identificazioni.length)
  const max = coperture.length ? coperture[0].coperti : 0
  const inTesta = coperture.filter((c) => c.coperti === max)
  const pareggio = coperture.length > 1 && inTesta.length > 1
  const copertutaZeroOvunque = coperture.length > 0 && max === 0
  const vincitriceNuova = coperture.length === 0 || copertutaZeroOvunque || pareggio ? null : coperture[0].voce
  const attuale = voceAttuale(luogo, voci)
  esiti.push({
    luogo,
    voci,
    coperture,
    vincitriceNuova,
    pareggio,
    copertutaZeroOvunque,
    vinciteceAttuale: attuale,
    cambia: vincitriceNuova !== null && attuale !== null && vincitriceNuova.id !== attuale.id,
  })
}

// ---------------------------------------------------------------------------
// Rapporto
// ---------------------------------------------------------------------------

const r: string[] = []
const curati = new Set(luoghi.filter((l) => l.nomi.it !== '').map((l) => l.id))
const CON_APPARATO = ['ararat', 'eden', 'euphrates', 'tigris', 'ur']

r.push('# Rapporto — criterio di join OpenBible')
r.push('')
r.push(`Generato da \`scripts/rapporto-join-openbible.ts\`. **Nessun file di dati è stato scritto.**`)
r.push('')
r.push(`Luoghi in \`public/data/places.json\`: ${luoghi.length}. Di questi, ${curati.size} hanno \`nomi.it\` valorizzato (perimetro toccato dalla curation).`)
r.push('')

// --- 1. tenuta del criterio ---
r.push('## 1. Tenuta del criterio')
r.push('')
const conVoci = esiti.filter((e) => e.voci.length > 0)
const contesi = esiti.filter((e) => e.voci.length > 1)
const senzaVoce = esiti.filter((e) => e.luogo.tipnr_id && e.voci.length === 0)
r.push(`- luoghi con almeno una voce OpenBible agganciata per id: **${conVoci.length}**`)
r.push(`- luoghi con id TIPNR conteso da più voci (dove il criterio conta): **${contesi.length}**`)
r.push(`- luoghi senza alcuna voce agganciata per id: **${senzaVoce.length}** (il criterio non li tocca: restano al ripiego per nome)`)
r.push(`- luoghi senza \`tipnr_id\`, non indicizzabili: **${esiti.filter((e) => !e.luogo.tipnr_id).length}**`)
r.push('')
const distr = { zero: 0, parziale: 0, totale: 0 }
for (const e of contesi) {
  if (e.copertutaZeroOvunque) distr.zero++
  else if (e.coperture[0].quota >= 1) distr.totale++
  else distr.parziale++
}
r.push('**Distribuzione della copertura sui soli id contesi**')
r.push('')
r.push(`- copertura piena dei nostri riferimenti da parte della voce in testa: **${distr.totale}**`)
r.push(`- copertura parziale: **${distr.parziale}**`)
r.push(`- copertura zero per tutte le voci (il criterio non discrimina): **${distr.zero}**`)
r.push(`- pareggio fra due o più voci: **${contesi.filter((e) => e.pareggio).length}**`)
r.push('')
const rif1 = luoghi.filter((l) => l.riferimenti.length === 1).length
const rif2 = luoghi.filter((l) => l.riferimenti.length === 2).length
r.push('**Dove il criterio è strutturalmente debole**')
r.push('')
r.push(`- luoghi con **un solo** riferimento: **${rif1}** — il test si riduce a «questa voce cita quel versetto?», e due voci possono citarlo entrambe`)
r.push(`- luoghi con **due** riferimenti: **${rif2}**`)
r.push(`- i nostri \`riferimenti\` sono **filtrati al Pentateuco**, \`verses\` copre tutta la Bibbia: per questo si misura la copertura dei nostri riferimenti e non l'intersezione simmetrica. Un luogo cui il Pentateuco dedica un versetto e il resto della Bibbia trenta resta deciso da quell'unico versetto.`)
r.push('')
r.push('**Errore che il criterio eredita invece di correggere**')
r.push('')
r.push(
  `I \`riferimenti\` vengono da TIPNR. Se TIPNR ha agganciato l'entità sbagliata, i riferimenti sono quelli dell'entità sbagliata, e la sovrapposizione con \`verses\` li conferma con sicurezza apparente: il criterio misura la coerenza fra due sorgenti, non la verità. Il caso riconoscibile è quello in cui **la voce vincente copre i riferimenti ma il suo nome non c'entra nulla** con il nome TIPNR; il caso non riconoscibile in automatico è l'omonimo che compare negli stessi versetti. Elenco sotto i primi.`,
)
r.push('')
const sospetti = contesi.filter((e) => {
  if (!e.vincitriceNuova) return false
  const nome = (e.luogo.nomi.it || e.luogo.id).toLowerCase()
  const slug = e.vincitriceNuova.friendly_id.toLowerCase()
  return !slug.includes(nome.slice(0, 4)) && !nome.includes(slug.slice(0, 4))
})
if (sospetti.length === 0) r.push('_Nessun caso: su tutti gli id contesi la voce vincente ha un nome compatibile con quello del record._')
else
  for (const e of sospetti)
    r.push(`- \`${e.luogo.id}\` (${e.luogo.nomi.it || '—'}) → voce «${e.vincitriceNuova!.friendly_id}», copertura ${e.coperture[0].coperti}/${e.luogo.riferimenti.length}`)
r.push('')
r.push(
  '**Quanto vale questo controllo.** Confronta il nome italiano del nostro record con il nome inglese della voce OpenBible, quindi segnala anche le equivalenze legittime: un toponimo con due nomi antichi (On/Eliopoli, Kittim/Cipro, Efrata/Betlemme, Babele/Babilonia) e perfino la semplice differenza di lingua (Assiria/Assyria) finiscono nell\'elenco. Va letto come «casi da guardare a mano», non come «errori trovati»: se dopo l\'ispezione ne resta zero, il criterio non è dimostrato sicuro — è solo non smentito da un controllo debole.',
)
r.push('')

// --- 2. effetti sui record ---
r.push('## 2. Effetti sui record')
r.push('')
const cambiano = esiti.filter((e) => e.cambia)
r.push(`Luoghi i cui candidati cambierebbero: **${cambiano.length}**`)
r.push('')
if (cambiano.length > 0) {
  r.push('| luogo | nomi.it | curato | voce attuale | voce nuova | cand. oggi | cand. dopo |')
  r.push('|---|---|---|---|---|---|---|')
  for (const e of cambiano)
    r.push(
      `| \`${e.luogo.id}\` | ${e.luogo.nomi.it || '—'} | ${curati.has(e.luogo.id) ? 'sì' : 'no'} | ${e.vinciteceAttuale!.friendly_id} | ${e.vincitriceNuova!.friendly_id} | ${e.luogo.candidati.length} | ${e.vincitriceNuova!.identificazioni.length} |`,
    )
  r.push('')
  const cambianoCurati = cambiano.filter((e) => curati.has(e.luogo.id))
  r.push(`- di cui dentro il perimetro della curation (\`nomi.it\` valorizzato): **${cambianoCurati.length}**`)
  r.push(`- di cui mai toccati dalla curation: **${cambiano.length - cambianoCurati.length}**`)
  const conApparato = cambiano.filter((e) => CON_APPARATO.includes(e.luogo.id))
  r.push(
    `- di cui fra i 5 con \`pro\`/\`contro\` e fonte non-dataset (${CON_APPARATO.join(', ')}): **${conApparato.length}**${conApparato.length ? ' → ' + conApparato.map((e) => e.luogo.id).join(', ') : ''}`,
  )
  const numeroDiverso = cambiano.filter((e) => e.vincitriceNuova!.identificazioni.length !== e.luogo.candidati.length)
  r.push(`- di cui con un **numero** di candidati diverso, non solo un'identità diversa: **${numeroDiverso.length}**`)
  const daZero = cambiano.filter((e) => e.luogo.candidati.length === 0 && e.vincitriceNuova!.identificazioni.length > 0)
  const aZero = cambiano.filter((e) => e.luogo.candidati.length > 0 && e.vincitriceNuova!.identificazioni.length === 0)
  r.push(`- passerebbero da **nessun candidato** ad averne: **${daZero.length}**${daZero.length ? ' → ' + daZero.map((e) => e.luogo.id).join(', ') : ''}`)
  r.push(`- passerebbero da avere candidati a **nessuno**: **${aZero.length}**${aZero.length ? ' → ' + aZero.map((e) => e.luogo.id).join(', ') : ''}`)
  r.push('')
}

// --- 3. il caso gihon ---
r.push('## 3. Il caso `gihon`, per esteso')
r.push('')
const g = esiti.find((e) => e.luogo.id === 'gihon')
if (g) {
  r.push(`\`riferimenti\` del nostro record: ${g.luogo.riferimenti.map((x) => `\`${x}\``).join(', ')} — **uno solo**, il fiume dell'Eden.`)
  r.push('')
  r.push(`Voci OpenBible che rivendicano l'id TIPNR \`${g.luogo.tipnr_id}\`: **${g.voci.length}**`)
  r.push('')
  for (const c of g.coperture) {
    r.push(`### ${c.voce.friendly_id} (\`${c.voce.id}\`)`)
    r.push('')
    r.push(`- versetti dichiarati dalla voce (Pentateuco): ${[...c.voce.versettiPent].map((v) => `\`${v}\``).join(', ') || '_nessuno_'}`)
    r.push(`- versetti dichiarati in tutta la Bibbia: ${c.voce.versettiTotali}`)
    r.push(`- **copertura dei nostri riferimenti: ${c.coperti}/${g.luogo.riferimenti.length}**`)
    r.push(`- identificazioni: ${c.voce.identificazioni.length}`)
    for (const i of c.voce.identificazioni) r.push(`  - ${nomiOb.get(i.id) ?? i.id} — punteggio ${i.punteggio ?? '—'}`)
    r.push('')
  }
  r.push('**Perché la selezione non è una coincidenza.** Le due voci non differiscono per un margine, ma per un valore di verità: una dichiara Gen 2,13 e nessun altro versetto, l\'altra dichiara solo 1Re e 2Cr e **non contiene Gen 2,13 affatto**. Il nostro record ha come unico riferimento Gen 2,13. La copertura è quindi 1/1 contro 0/1: il criterio non sceglie il più probabile fra due plausibili, esclude l\'unico che è incompatibile col dato.')
  r.push('')
  r.push(`I candidati oggi nel record sono ${g.luogo.candidati.length} (${g.luogo.candidati.map((c) => c.etichetta).join('; ')}), cioè quelli della voce che non cita Gen 2,13.`)
  r.push('')
}

// --- 4. elenco completo degli id contesi ---
r.push('## 4. Tutti gli id contesi')
r.push('')
r.push('| luogo | rif. | voci | copertura per voce | esito nuovo criterio |')
r.push('|---|---|---|---|---|')
for (const e of contesi) {
  const cop = e.coperture.map((c) => `${c.voce.friendly_id}: ${c.coperti}`).join(' · ')
  const esito = e.copertutaZeroOvunque ? '**non discrimina** (0 ovunque)' : e.pareggio ? '**pareggio**' : `→ ${e.vincitriceNuova!.friendly_id}`
  r.push(`| \`${e.luogo.id}\` | ${e.luogo.riferimenti.length} | ${e.voci.length} | ${cop} | ${esito} |`)
}
r.push('')
r.push('## 5. Ripiego quando il criterio non discrimina')
r.push('')
r.push(
  `Nei ${distr.zero + contesi.filter((e) => e.pareggio).length} casi in cui la copertura è zero ovunque o pareggia, il criterio non decide e serve un ripiego. Se il ripiego resta la colonna «OpenBible name» di TIPNR, in quei casi il criterio nuovo **coincide col vecchio** e non porta alcun miglioramento: l'ambiguità va dichiarata, non risolta in silenzio. Questi casi sono elencati per intero nella tabella sopra.`,
)
r.push('')

mkdirSync(path.dirname(USCITA), { recursive: true })
writeFileSync(USCITA, r.join('\n'), 'utf8')

console.log(`rapporto-join-openbible: scritto ${path.relative(RADICE, USCITA)}`)
console.log(`  luoghi esaminati: ${luoghi.length}`)
console.log(`  id contesi: ${contesi.length}`)
console.log(`  luoghi i cui candidati cambierebbero: ${cambiano.length}`)
console.log(`  di cui nel perimetro curation: ${cambiano.filter((e) => curati.has(e.luogo.id)).length}`)
console.log(`  copertura zero ovunque: ${distr.zero} · pareggi: ${contesi.filter((e) => e.pareggio).length}`)
console.log('  NESSUN file di dati scritto.')
