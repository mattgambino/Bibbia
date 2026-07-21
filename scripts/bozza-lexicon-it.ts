// scripts/bozza-lexicon-it.ts — assembla bootstrap/lexicon_it.json (ROADMAP F2.5).
//
// Divisione dei ruoli, deliberata:
//  - le glosse italiane (GLOSSE, sotto) sono CURATE A MANO: sono il dato [C] e
//    vivono qui in chiaro, riga per riga, revisionabili in diff;
//  - lo script non traduce nulla: legge da TBESH il testo inglese esatto da cui
//    ogni resa deriva e lo incolla nel `dettaglio` della fonte, così la catena
//    glossa italiana → glossa inglese → dStrong è verificabile senza fidarsi di
//    una trascrizione a mano.
//
// Fonte: TBESH — Translators Brief lexicon of Extended Strongs for Hebrew,
// STEPBible.org / Tyndale House Cambridge, CC BY 4.0. Si usa SOLO la colonna
// "Gloss" ("created by Tyndale scholars"): la colonna successiva, derivata
// dall'Abridged BDB di Online Bible, porta una restrizione d'uso esplicita nel
// preambolo del file e non entra nel dataset in nessuna forma.
//
// L'esecuzione è idempotente e il file prodotto è una BOZZA in bootstrap/:
// lo spostamento in public/data/ è dell'utente (CLAUDE.md, regola 3).
//
//   npx tsx scripts/bozza-lexicon-it.ts

import fs from 'node:fs'
import path from 'node:path'
import { LexiconIt, type Fonte, type VoceLexiconIt } from '../src/tipi/index.ts'

const RADICE = path.resolve(import.meta.dirname, '..')
const TBESH = path.join(
  RADICE,
  'scripts/sources/STEPBible-Data/Lexicons',
  'TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
)
const USCITA = path.join(RADICE, 'bootstrap/lexicon_it.json')

// ---------------------------------------------------------------------------
// Glosse italiane — curate a mano sul range Gen 1–3 (272 lemmi lessicali).
//
// Convenzioni:
//  - si conserva la struttura "generale: senso specifico" di TBESH, che è ciò
//    che tiene distinti i dStrong disambiguati (H0776G "terra: paese/pianeta"
//    vs H0776H "terra: suolo"): appiattirla perderebbe l'informazione;
//  - i verbi restano all'infinito, come in TBESH ("to eat" → "mangiare");
//  - i morfemi grammaticali H9xxx non stanno qui: sono prefissi, suffissi e
//    pronomi legati, già resi in italiano da src/lib/morfologia.ts.
// ---------------------------------------------------------------------------
const GLOSSE: Record<string, string> = {
  H0001G: 'padre',
  H0068G: 'pietra',
  H0108: 'vapore',
  H0120G: 'uomo',
  H0120H: "l'uomo (Adamo)",
  H0121G: 'Adamo',
  H0127G: 'terra: suolo',
  H0215: 'illuminare',
  H0216: 'luce',
  H0226H: 'segno: indicatore',
  H0259: 'uno',
  H0335: 'dove?',
  H0342: 'inimicizia',
  H0369: 'nulla, non esserci',
  H0376G: 'uomo',
  H0376H: 'uomo: marito',
  H0398: 'mangiare',
  H0402: 'cibo',
  H0413: 'a, verso',
  H0428: 'questi',
  H0430G: 'Dio',
  H0517: 'madre',
  H0559: 'dire',
  H0595: 'io',
  H0637: 'anche, per di più',
  H0639H: 'faccia: naso',
  H0639I: 'faccia',
  H0702: 'quattro',
  H0776G: 'terra: paese/pianeta',
  H0776H: 'terra: suolo',
  H0779: 'maledire',
  H0802G: 'donna',
  H0802H: 'donna: moglie',
  H0804G: 'Assiria',
  H0834A: 'che, il quale',
  H0853: "[segnacaso dell'oggetto diretto]",
  H0859A: 'tu (m. sing.)',
  H0905H: 'solo, da solo',
  H0914: 'separare',
  H0916: 'bdellio',
  H0922: 'vuoto',
  H0929: 'animale',
  H0935P: 'venire, entrare: portare',
  H0954: 'vergognarsi',
  H0996G: 'tra',
  H1115: 'perché non',
  H1121A: 'figlio: bambino',
  H1129: 'costruire',
  H1242: 'mattino',
  H1254A: 'creare',
  H1288: 'benedire',
  H1320: 'carne',
  H1419A: 'grande: ampio',
  H1512: 'ventre',
  H1521: 'Ghicon',
  H1571: 'anche',
  H1588M: 'giardino',
  H1644G: 'scacciare',
  H1692: 'aderire, unirsi',
  H1710: 'pesce',
  H1823: 'somiglianza',
  H1847: 'conoscenza',
  H1863: 'cardo',
  H1870K: 'via: strada',
  H1876: 'germogliare',
  H1877: 'erba',
  H1931: 'egli/ella/esso',
  H1961: 'essere',
  H1980G: 'andare: andò',
  H1980I: 'andare: camminare',
  H1992: 'essi (m.)',
  H2005: 'ecco!',
  H2009: 'ecco',
  H2015: 'rivoltare, volgere',
  H2032: 'concepimento',
  H2063: 'questa',
  H2091: 'oro',
  H2145: 'maschio',
  H2188: 'sudore',
  H2232: 'seminare',
  H2233G: 'seme',
  H2233H: 'seme: discendenza',
  H2244: 'nascondersi',
  H2290B: 'cintura',
  H2313: 'Tigri',
  H2332: 'Eva',
  H2341G: 'Avila',
  H2416A: 'vivo',
  H2416C: 'essere vivente',
  H2416E: 'vita',
  H2421: 'vivere',
  H2530A: 'desiderare',
  H2549: 'quinto',
  H2719: 'spada',
  H2822: 'tenebra',
  H2895: 'essere buono, piacere',
  H2896A: 'piacevole',
  H2896B: 'buono',
  H2962: 'non ancora, prima che',
  H3004: 'terraferma',
  H3027G: 'mano',
  H3045: 'conoscere',
  H3068G: 'SIGNORE (tetragramma YHWH)',
  H3117G: 'giorno',
  H3205: 'generare, partorire',
  H3220G: 'mare',
  H3318L: 'uscire: sgorgare',
  H3318M: 'uscire: produrre',
  H3335G: 'plasmare',
  H3372G: 'temere',
  H3418: 'verde',
  H3462: 'dormire',
  H3533: 'sottomettere',
  H3556: 'stella',
  H3568A: 'Cus',
  H3588A: 'poiché',
  H3605: 'tutto',
  H3615G: 'terminare, portare a compimento',
  H3651C: 'così',
  H3671: 'ala',
  H3742: 'cherubino',
  H3801: 'tunica',
  H3808: 'non',
  H3847: 'vestire',
  H3858: 'fiamma',
  H3899H: 'cibo: pane',
  H3915: 'notte',
  H3947G: 'prendere',
  H3966: 'molto',
  H3974: 'luce (corpo luminoso)',
  H3978: 'cibo',
  H4100: 'che cosa?',
  H4150G: 'incontro: tempo fissato',
  H4191: 'morire',
  H4305: 'far piovere',
  H4310: 'chi?',
  H4325G: 'acqua',
  H4327: 'specie',
  H4390: 'riempire',
  H4399: 'lavoro, opera',
  H4475: 'dominio',
  H4480A: 'da',
  H4672: 'trovare',
  H4723C: 'raccolta',
  H4725: 'luogo',
  H4758: 'aspetto',
  H4910: 'dominare',
  H5046: 'riferire, annunciare',
  H5048: 'davanti a',
  H5060: 'toccare',
  H5104H: 'fiume',
  H5117: 'riposare',
  H5175: 'serpente',
  H5193: 'piantare',
  H5301: 'soffiare',
  H5307G: 'cadere',
  H5315H: 'anima: vita',
  H5315K: 'anima: animale',
  H5347: 'femmina',
  H5377: 'ingannare',
  H5397: 'alito',
  H5414G: 'dare',
  H5414H: 'dare: porre',
  H5437G: 'girare, circondare',
  H5462: 'chiudere',
  H5647I: 'servire: lavorare',
  H5668: 'a causa di',
  H5704: 'fino a',
  H5731B: 'Eden',
  H5769G: 'sempre: perpetuo',
  H5774A: 'volare',
  H5775: 'uccello',
  H5785: 'pelle',
  H5800A: 'lasciare: abbandonare',
  H5828: 'aiuto',
  H5869A: 'occhio',
  H5903: 'nudo',
  H5921A: 'sopra, su',
  H5927G: 'salire',
  H5929: 'foglia',
  H5973A: 'con',
  H5978: 'con me',
  H6083: 'polvere',
  H6086H: 'albero',
  H6089A: 'pena',
  H6093: 'fatica',
  H6106G: 'osso',
  H6119: 'calcagno',
  H6153: 'sera',
  H6174: 'nudo',
  H6175: 'accorto, astuto',
  H6212: 'vegetazione',
  H6213A: 'fare: compiere',
  H6213H: 'fare',
  H6258: 'ora',
  H6376: 'Pison',
  H6435: 'perché non',
  H6440H: 'faccia',
  H6440J: 'faccia: superficie',
  H6471: 'volta',
  H6491: 'aprire',
  H6504: 'dividersi',
  H6509: 'essere fecondo',
  H6529: 'frutto',
  H6578: 'Eufrate',
  H6635A: 'schiera',
  H6680: 'comandare',
  H6754: 'immagine',
  H6763: 'fianco, costola',
  H6779: 'germogliare',
  H6924G: 'davanti: oriente',
  H6926: 'oriente',
  H6942G: 'consacrare',
  H6960B: 'raccogliersi',
  H6963A: 'voce',
  H6963H: 'voce: rumore',
  H6975: 'spina',
  H6996B: 'piccolo',
  H7121G: 'chiamare: rivolgersi a',
  H7121H: 'chiamare: chiamare per nome',
  H7200G: 'vedere',
  H7218A: 'testa',
  H7218J: 'testa: principale',
  H7225G: 'primo: principio',
  H7235A: 'moltiplicare',
  H7243: 'quarto',
  H7287A: 'dominare',
  H7307G: 'spirito',
  H7307H: 'spirito: soffio',
  H7363B: 'aleggiare',
  H7430: 'strisciare',
  H7431: 'strisciante',
  H7451B: 'cattivo: male',
  H7549: 'distesa',
  H7637: 'settimo',
  H7673A: 'cessare',
  H7704G: 'terra: campo, campagna',
  H7718: 'onice',
  H7725G: 'tornare',
  H7760H: 'porre',
  H7779: 'schiacciare',
  H7880: 'arbusto',
  H7896H: 'porre',
  H7919A: 'essere accorto',
  H7931: 'abitare',
  H7971G: 'mandare: allontanare',
  H7971K: 'mandare: stendere',
  H7992: 'terzo',
  H8033G: 'là',
  H8034: 'nome',
  H8064: 'cielo',
  H8085G: 'udire',
  H8104H: 'custodire',
  H8141: 'anno',
  H8145: 'secondo',
  H8147: 'due',
  H8248G: 'irrigare',
  H8317: 'brulicare',
  H8318: 'brulichio',
  H8345: 'sesto',
  H8378: 'desiderio',
  H8384: 'fico',
  H8414: 'assenza di forma',
  H8415: 'abisso',
  H8432: 'mezzo',
  H8435: 'generazione',
  H8478G: 'sotto',
  H8478H: 'sotto: al posto di',
  H8577N: 'serpente: mostro',
  H8609: 'cucire',
  H8639: 'torpore',
  H8669: 'desiderio',
}

// ---------------------------------------------------------------------------
// TBESH: dStrong → glossa inglese.
//
// Il file è TSV senza riga di intestazione (il preambolo è testo libero). La
// colonna 2 ha forma "H0776G = in Hebrew of" oppure "H1254A =": il dStrong è il
// primo token. La colonna 7 è la glossa Tyndale, l'unica che usiamo.
// ---------------------------------------------------------------------------
function leggiTbesh(): Map<string, string> {
  const glosse = new Map<string, string>()
  for (const riga of fs.readFileSync(TBESH, 'utf8').split(/\r?\n/)) {
    const col = riga.split('\t')
    if (col.length < 7) continue
    const m = /^(H\d{1,4}[A-Za-z]?)\s*=/.exec(col[1] ?? '')
    if (!m) continue
    const glossa = (col[6] ?? '').trim()
    if (glossa) glosse.set(m[1], glossa)
  }
  return glosse
}

function fonte(glossaEn: string): Fonte {
  return {
    tipo: 'dataset',
    titolo:
      'STEPBible TBESH (Translators Brief lexicon of Extended Strongs for Hebrew), Tyndale House Cambridge',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    dettaglio: `CC BY 4.0 — resa italiana della colonna Gloss: "${glossaEn}"`,
  }
}

function main() {
  const tbesh = leggiTbesh()
  const mancanti: string[] = []
  const lexicon: Record<string, VoceLexiconIt> = {}

  for (const chiave of Object.keys(GLOSSE).sort()) {
    const glossaEn = tbesh.get(chiave)
    if (!glossaEn) {
      mancanti.push(chiave)
      continue
    }
    lexicon[chiave] = {
      glossa_it: GLOSSE[chiave]!,
      fonti: [fonte(glossaEn)],
      // Tutte le voci restano da verificare: la rassegna avviene in blocco in F5.3.
      da_verificare: true,
    }
  }

  if (mancanti.length) {
    console.error(`ERRORE: dStrong assenti da TBESH: ${mancanti.join(', ')}`)
    process.exit(1)
  }

  LexiconIt.parse(lexicon)
  fs.writeFileSync(USCITA, JSON.stringify(lexicon, null, 2) + '\n', 'utf8')
  console.log(`bozza-lexicon-it: ${Object.keys(lexicon).length} voci → ${path.relative(RADICE, USCITA)}`)
}

main()
