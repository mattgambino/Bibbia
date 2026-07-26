# Pentateuco in contesto

App personale per lo studio del Pentateuco: ebraico masoretico word-level con il
contesto sempre visibile accanto al testo — geografia, tre assi temporali distinti
(narrato / storico-critico / composizione), genealogie, note critiche — e
**l'incertezza trattata come dato di prima classe** (ogni luogo, data, identificazione
e affermazione porta un grado di confidenza esplicito e visibile).

SPA statica **React + Vite + TypeScript**, nessun backend: i dati sono JSON statici
sotto `public/data/`, caricati a runtime. Lingua di lavoro e UI: italiano. La curation
copre **Genesi 1–11**; il testo ebraico e la struttura libro/capitolo/versetto sono
importati per tutto il Pentateuco.

**Rete a runtime.** L'app contatta tre sole origini, tutte facoltative: i **tile
OpenStreetMap** per la carta di sfondo della mappa (SPECIFICA §5), **Ollama in locale**
per il modulo assistente, e i link a **Sefaria** nelle note della tradizione ebraica (che
sono `href`, non chiamate). Tutto il resto — testo, dati, font — è servito dalla stessa
origine: **offline l'app funziona per intero**, con la sola mappa priva di carta di
sfondo (i marker e i loro dati restano al loro posto).

> Questo README è la guida tecnica (setup, comandi, dati). La **visione e i vincoli**
> stanno in `docs/`: `SPECIFICA.md` (cosa e perché), `SCHEMI-DATI.md` (schemi v1 e
> convenzioni — prevale sul §6 della specifica), `DESIGN.md` (direzione visiva),
> `ROADMAP.md` (avanzamento). `CLAUDE.md` è il contratto operativo per l'assistente di
> codice.

## Requisiti

- **Node.js LTS** (≥ 20) e npm — per l'app (Vite) e gli script di import/validazione.
- **Ollama** in locale — *solo* per il modulo assistente (opzionale). Vedi
  [`docs/ASSISTENTE.md`](docs/ASSISTENTE.md).
- **Python 3** — *solo* se si lavora alla UI con la skill di design `ui-ux-pro-max`
  (i suoi script interni lo richiedono). Non serve per usare o buildare l'app.

Gli script sono in TypeScript ed eseguiti con `tsx`; non serve compilarli a parte.

## Setup

```bash
npm install
npm run dev        # server di sviluppo Vite (http://localhost:5173)
```

L'app parte con i dati già presenti in `public/data/` (versionati nel repo). Per una
build di produzione statica:

```bash
npm run build      # tsc -b && vite build → dist/
npm run preview    # anteprima locale del build
```

`dist/` è servibile da qualunque hosting statico o dal filesystem: non c'è backend.

## Comandi

| Comando            | Cosa fa                                                                 |
|--------------------|------------------------------------------------------------------------|
| `npm run dev`      | Server di sviluppo con HMR.                                             |
| `npm run build`    | Type-check (`tsc -b`) + build di produzione in `dist/`.                 |
| `npm run preview`  | Serve il build di `dist/` in locale.                                    |
| `npm run valida`   | Valida `public/data/` e `bootstrap/` contro gli schemi Zod + controlli incrociati. Exit ≠ 0 se ci sono errori. |
| `npm test`         | Regressione del guardrail RAG (`src/lib/rag.ts`) + giro del validatore sulle fixture. Nessuna dipendenza aggiuntiva: `node --test` con `tsx`. |
| `npm run dossier`  | Genera in `export/` il dossier leggibile dei soli file curati (`--solo-da-verificare` per il solo residuo da verificare). |

**Regola d'oro:** dopo ogni modifica a schemi o dati, `npm run valida` deve essere
verde. Un task non è chiuso con la validazione rossa.

I test di `test/` coprono l'unico punto in cui i non-negoziabili sul testo biblico
diventano codice eseguito: la post-verifica dei riferimenti della risposta
dell'assistente. Anche lì vale la regola 1 — nessun testo biblico è scritto nei test,
i casi si scelgono dal dataset e i testi attesi si leggono dai file.

## Struttura

```
src/
  tipi/         Schemi Zod — unica fonte di verità dei tipi (i tipi statici sono z.infer)
  dati/         Caricamento JSON (cache per libro) e hook React
  lib/          Logica pura: morfologia, riferimenti, pericopi, confidenza, tempo,
                genealogia, luoghi, ricerca, note, RAG, client Ollama
  componenti/   Componenti UI condivisi (colonne, pannelli, mappa, alberi, elementi)
  viste/        Viste a schermo pieno: Lettura, Mappa, Timeline, Genealogie, Ricerca, Assistente
  stili/        tokens.css (design token, unica fonte) + app.css (0 esadecimali fuori dai token)
public/
  data/         I dati JSON serviti a runtime (vedi sotto)
  fonts/        Font self-hosted (Ezra SIL per l'ebraico, Charis SIL, IBM Plex Sans)
scripts/        Script di import, validazione, export (TypeScript, via tsx)
  fixtures/     Mini-dataset di prova per il validatore (valido + volutamente rotto)
  sources/      Sorgenti scaricate per gli import (in .gitignore — vedi «Rigenerare i dati»)
docs/           Documenti vincolanti (specifica, schemi, design, roadmap, assistente)
bootstrap/      Sosta delle bozze di curation prima della revisione umana (di norma vuota)
```

### I dati: generati `[G]` vs curati `[C]`

`public/data/` contiene due nature di file, con regole diverse (dettaglio in
`docs/SCHEMI-DATI.md`):

- **Generati `[G]`** — prodotti da uno script di import, con un blocco `meta`
  (fonte, licenza, data, script). **Non si editano a mano:** si corregge lo script e
  si rigenera. Sono: `verses/`, `words/`, `indices/lemmi.json`, `crossrefs/`,
  `translations/luzzi.json`, `embeddings.json`.
- **Curati `[C]`** — contenuto rivisto dall'utente, ogni claim con `fonti` reali o
  `da_verificare: true`. Sono: `events.json`, `notes.json`, `places.json`,
  `people.json`, `lexicon_it.json`, `translations/letterale.json`,
  `translations/index.json`.

Le **bozze** di curation prodotte in blocco (es. l'import TIPNR di luoghi/persone)
si fermano in `bootstrap/` e vanno in `public/data/` **solo dopo revisione umana**:
non si rigenerano sovrascrivendo ciecamente i file curati (vedi
«Rigenerare i dati» → TIPNR).

## Aggiungere una traduzione personale

Lo «slot traduzioni» accetta qualunque traduzione in tuo possesso (es. CEI 2008,
Bibbia di Gerusalemme) come file conforme allo schema. **Il testo lo fornisci tu**,
a partire dalla copia che possiedi: l'app non genera né ricostruisce a memoria il
testo di una traduzione (SPECIFICA §7, regola 1 di `CLAUDE.md`).

Una traduzione è **un file per traduzione** in `public/data/translations/<id>.json`,
conforme allo schema `Traduzione` in
[`src/tipi/traduzione.ts`](src/tipi/traduzione.ts):

```json
{
  "meta": {
    "id": "cei2008",
    "nome": "CEI 2008",
    "anno": 2008,
    "lingua": "it",
    "licenza": "© … (uso personale)",
    "completa": false
  },
  "testi": {
    "gen.1.1": "…",
    "gen.1.2": "…"
  }
}
```

Passi:

1. **Prepara il file.** Le chiavi di `testi` sono **id versetto TM** (`gen.1.1`,
   `exo.20.1`, …), non la numerazione della tua fonte. Se la tua fonte usa una
   versificazione diversa (tipicamente KJV), va rimappata sul TM: gli import
   `import-luzzi.ts` / `import-tsk.ts` mostrano come si fa con TVTMS di STEPBible,
   e possono fare da base per uno script di conversione della tua fonte.
2. **Compila `meta`.** `completa: true` solo se copre tutti i versetti TM del range;
   i buchi noti e giustificati (versetti che la versificazione d'origine non
   distingue) si dichiarano in `meta.lacune` con il motivo — il validatore accetta
   come buco solo ciò che è dichiarato. `anno` può essere `null`. `fonti` è opzionale
   ma consigliato.
3. **Registrala nel manifest.** Aggiungi l'`id` all'array `disponibili` in
   [`public/data/translations/index.json`](public/data/translations/index.json):
   il selettore traduzioni legge da lì.
4. **Valida.** `npm run valida` controlla che le chiavi risolvano su id TM esistenti
   e (se `completa`) che non ci siano buchi non dichiarati.

La traduzione compare nel selettore della colonna di navigazione. Trattandosi di un
file `[C]`, se la prepari con l'assistente di codice va scritta solo con la tua
approvazione esplicita del contenuto.

## Rigenerare i dati

Le sorgenti di import stanno in `scripts/sources/` (**in `.gitignore`**: non sono
ridistribuite, vanno scaricate). Ogni script documenta nella propria intestazione il
formato atteso, il mapping colonne→campi e la licenza della fonte: leggila prima di
rigenerare. Esecuzione: `npx tsx scripts/<script>.ts`.

| Script                    | Sorgente (in `scripts/sources/`)                                             | Output                                                        | Natura |
|---------------------------|------------------------------------------------------------------------------|--------------------------------------------------------------|--------|
| `import-tahot.ts`         | STEPBible-Data — TAHOT Gen–Deu (`github.com/STEPBible/STEPBible-Data`, CC BY 4.0) | `verses/`, `words/`, `indices/lemmi.json`                 | `[G]`  |
| `import-luzzi.ts`         | eBible.org `ita1927` USFM (pubblico dominio) + TVTMS (STEPBible)              | `translations/luzzi.json` + manifest                          | `[G]`  |
| `import-tsk.ts`           | TSK Enhanced (`biblewebapp`, © 2010 T. S. Morton, redistribuz. libera) + TVTMS | `crossrefs/`                                                | `[G]`  |
| `import-tipnr.ts`         | STEPBible-Data TIPNR (Proper Nouns) + OpenBible.info Bible Geocoding          | **`bootstrap/`** `places.json`, `people.json` (bozze)        | `[C]`  |
| `gen-embeddings.ts`       | `public/data/` (letterale + note) via Ollama `bge-m3`                        | `embeddings.json`                                             | `[G]`  |

- **File `[G]`:** lo script sovrascrive direttamente `public/data/`. Rigenerare è
  sicuro: sono derivati deterministici della sorgente. Dopo, `npm run valida`.
- **`import-tipnr.ts` (`[C]`):** genera **bozze in `bootstrap/`**, azzerando i campi
  di curation e senza le entità aggiunte a mano. **Non** le si sposta ciecamente in
  `public/data/`: la curation già rivista va **riconciliata a mano** usando `git` come
  base (`git diff -- bootstrap/…`; i file sono serializzati un-record-per-riga apposta
  per rendere il diff leggibile). Il procedimento completo è nell'avvertenza in coda a
  F1.3 di `docs/ROADMAP.md`.
- **`gen-embeddings.ts`:** richiede Ollama attivo e `bge-m3` installato; da rieseguire
  ogni volta che cambiano letterale o note curate. Vedi
  [`docs/ASSISTENTE.md`](docs/ASSISTENTE.md).

Script accessori (non generano dati dell'app): `bozza-lexicon-it.ts` (bozza glosse da
TBESH → `bootstrap/`), `rapporto-composizione.ts` e `rapporto-join-openbible.ts`
(istruttorie in `export/`), `export-dossier.ts` (`npm run dossier`).

## Modulo assistente (RAG)

Assistente locale che risponde **solo** sul materiale curato, via Ollama in locale
(nessun servizio remoto, nessuna chiave). Il testo dei versetti viene sempre dal
database, mai dall'LLM; i riferimenti citati sono post-verificati contro il dataset.
Setup, `OLLAMA_ORIGINS` (CORS) e funzionamento: [`docs/ASSISTENTE.md`](docs/ASSISTENTE.md).

## Licenze dei dati

I dati importati mantengono le loro licenze, dichiarate nel `meta` di ogni file `[G]`:
TAHOT e TVTMS sono CC BY 4.0 (STEPBible / Tyndale House); la Riveduta Luzzi 1927 è di
pubblico dominio; il TSK Enhanced è coperto da copyright derivativo con ridistribuzione
libera solo a titolo gratuito e in formato aperto. Le note `tradizione_ebraica`
linkano e riassumono le fonti (API Sefaria) senza copiarne il testo nel dataset.
