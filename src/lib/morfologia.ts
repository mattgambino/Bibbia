// src/lib/morfologia.ts — decodifica leggibile del campo `morph` di words/ (task F0.4, stub).
//
// TAHOT codifica la morfologia in stile OpenScriptures: il primo carattere è la
// lingua (H = ebraico, A = aramaico), poi un segmento per morfema, separati da "/"
// (es. "HR/Ncfsa" → preposizione + sostantivo comune femminile singolare assoluto).
// Copertura volutamente parziale: una prima manciata di codici comuni. La tabella
// completa si fissa in F1.1 leggendo la documentazione del formato nel repo
// STEPBible-Data; ogni sigla non coperta cade nel fallback
// "codice non decodificato: <sigla>", mai in una decodifica improvvisata.

const PERSONA: Record<string, string> = {
  '1': 'prima persona',
  '2': 'seconda persona',
  '3': 'terza persona',
}

const GENERE: Record<string, string> = {
  m: 'maschile',
  f: 'femminile',
  c: 'genere comune',
  b: 'maschile/femminile',
}

const NUMERO: Record<string, string> = {
  s: 'singolare',
  p: 'plurale',
  d: 'duale',
}

const STATO: Record<string, string> = {
  a: 'assoluto',
  c: 'costrutto',
  d: 'determinato',
}

const TIPO_SOSTANTIVO: Record<string, string> = {
  c: 'comune',
  p: 'proprio',
  g: 'gentilizio',
}

const TIPO_PRONOME: Record<string, string> = {
  d: 'dimostrativo',
  f: 'indefinito',
  i: 'interrogativo',
  p: 'personale',
  r: 'relativo',
}

const PARTICELLE: Record<string, string> = {
  a: 'particella di affermazione',
  d: 'articolo determinativo',
  e: 'particella esortativa',
  i: 'particella interrogativa',
  j: 'interiezione',
  m: 'particella dimostrativa',
  n: 'particella di negazione',
  o: "marca dell'oggetto diretto",
  r: 'particella relativa',
}

const TIPO_SUFFISSO: Record<string, string> = {
  d: 'he direzionale',
  h: 'he paragogico',
  n: 'nun paragogico',
  p: 'pronominale',
}

const TEMA_VERBALE: Record<string, string> = {
  q: 'qal',
  N: 'nifal',
  p: 'piel',
  P: 'pual',
  h: 'hifil',
  H: 'hofal',
  t: 'hitpael',
}

const CONIUGAZIONE: Record<string, string> = {
  p: 'perfetto (qatal)',
  q: 'perfetto sequenziale (weqatal)',
  i: 'imperfetto (yiqtol)',
  w: 'imperfetto sequenziale (wayyiqtol)',
  h: 'coortativo',
  j: 'iussivo',
  v: 'imperativo',
  r: 'participio attivo',
  s: 'participio passivo',
  a: 'infinito assoluto',
  c: 'infinito costrutto',
}

/**
 * Decodifica `sigla` carattere per carattere contro le tabelle date, in ordine:
 * ogni tabella consuma al più il carattere successivo (i tratti finali possono
 * mancare). null se resta qualcosa di non decodificabile.
 */
function decodificaCaratteri(sigla: string, tabelle: Record<string, string>[]): string[] | null {
  const parti: string[] = []
  let i = 0
  for (const tabella of tabelle) {
    if (i >= sigla.length) break
    const voce = tabella[sigla[i]]
    if (voce === undefined) return null
    parti.push(voce)
    i++
  }
  return i === sigla.length ? parti : null
}

/** Un segmento (morfema) del codice; null = non coperto dallo stub. */
function decodificaSegmento(sigla: string): string | null {
  if (sigla.length === 0) return null
  const resto = sigla.slice(1)
  switch (sigla[0]) {
    case 'C':
      return resto === '' ? 'congiunzione' : null
    case 'D':
      return resto === '' ? 'avverbio' : null
    case 'R':
      if (resto === '') return 'preposizione'
      if (resto === 'd') return 'preposizione con articolo'
      return null
    case 'T':
      if (resto === '') return 'particella'
      return resto.length === 1 ? (PARTICELLE[resto] ?? null) : null
    case 'N': {
      const parti = decodificaCaratteri(resto, [TIPO_SOSTANTIVO, GENERE, NUMERO, STATO])
      return parti ? ['sostantivo', ...parti].join(' ') : null
    }
    case 'P': {
      if (resto === '') return null
      const tipo = TIPO_PRONOME[resto[0]]
      if (tipo === undefined) return null
      const parti = decodificaCaratteri(resto.slice(1), [PERSONA, GENERE, NUMERO])
      return parti ? ['pronome', tipo, ...parti].join(' ') : null
    }
    case 'S': {
      if (resto === '') return null
      const tipo = TIPO_SUFFISSO[resto[0]]
      if (tipo === undefined) return null
      const parti = decodificaCaratteri(resto.slice(1), [PERSONA, GENERE, NUMERO])
      return parti ? ['suffisso', tipo, ...parti].join(' ') : null
    }
    case 'V': {
      if (resto.length < 2) return null
      const tema = TEMA_VERBALE[resto[0]]
      const coniugazione = CONIUGAZIONE[resto[1]]
      if (tema === undefined || coniugazione === undefined) return null
      const coda = resto.slice(2)
      let parti: string[] | null
      if (resto[1] === 'r' || resto[1] === 's') parti = decodificaCaratteri(coda, [GENERE, NUMERO, STATO])
      else if (resto[1] === 'a' || resto[1] === 'c') parti = coda === '' ? [] : null
      else parti = decodificaCaratteri(coda, [PERSONA, GENERE, NUMERO])
      return parti ? ['verbo', tema, coniugazione, ...parti].join(' ') : null
    }
    default:
      return null
  }
}

/**
 * Decodifica leggibile in italiano di un codice `morph` TAHOT.
 * I segmenti non coperti dallo stub restano "codice non decodificato: <sigla>".
 */
export function decodificaMorph(morph: string): string {
  if (morph === '') return 'codice non decodificato: (vuoto)'
  let corpo = morph
  let lingua = ''
  // Nel dato TAHOT il primo carattere è sempre la lingua; l'ebraico si omette.
  if (corpo.startsWith('H')) corpo = corpo.slice(1)
  else if (corpo.startsWith('A')) {
    lingua = '(aramaico) '
    corpo = corpo.slice(1)
  }
  if (corpo === '') return `codice non decodificato: ${morph}`
  const descrizioni = corpo.split('/').map((s) => decodificaSegmento(s) ?? `codice non decodificato: ${s}`)
  return lingua + descrizioni.join(' + ')
}
