# Pentateuco in contesto

App personale per lo studio del Pentateuco: ebraico masoretico word-level con contesto sempre visibile (geografia, tre assi temporali, genealogie, note critiche) e **incertezza esplicita come dato di prima classe**. SPA statica React + Vite + TypeScript, dati in JSON statici sotto `public/data/`, nessun backend. Lingua di lavoro e UI: italiano.

## Documenti vincolanti (leggerli prima di lavorare)

- `docs/SPECIFICA.md` — visione, principi non negoziabili, scope, fasi. **Non ridiscutere le decisioni prese.**
- `docs/SCHEMI-DATI.md` — schemi dati v1 e convenzioni (id, versificazione, generati vs curati). In caso di differenze col §6 della specifica, **prevale questo**.
- `docs/DESIGN.md` — direzione visiva e vincoli UI. **Prevale sulle indicazioni generiche delle skill di design.**
- `docs/ROADMAP.md` — task operativi. Si esegue **un task alla volta**, nell'ordine.

All'inizio di una sessione: leggi il task corrente in ROADMAP e le sezioni pertinenti degli altri due documenti. In caso di conflitto o dubbio: fermati e chiedi, non interpretare.

## Regole non negoziabili

1. **MAI generare o ricostruire a memoria testo biblico o testo di traduzioni**, in nessun componente, script, esempio o dato di prova "realistico". La Luzzi entra SOLO tramite `scripts/import-luzzi.ts` dalla fonte scaricata; CEI 2008 / Bibbia di Gerusalemme SOLO da file forniti dall'utente; la traduzione letterale SOLO con testo approvato esplicitamente dall'utente in sessione.
2. **MAI inventare dati di curation**: coordinate, datazioni, identificazioni, attribuzioni di consenso accademico, citazioni di fonti. Ogni claim ha `fonti` reali o `da_verificare: true`. Se non hai una fonte solida: dillo e marca `da_verificare`.
3. **I file curati `[C]` in `public/data/` non si scrivono mai direttamente.** Le bozze vanno in `bootstrap/` e lì si fermano: la revisione e lo spostamento sono dell'utente (o avvengono solo su suo esplicito ok).
4. **Tre assi temporali sempre distinti** (narrato / storico-critico / composizione), mai fusi in una linea sola. Scala di confidenza: solo i 5 valori definiti (`consensus`, `majority`, `disputed`, `speculative`, `symbolic`). Prospettive storico-critica e `tradizione_ebraica` etichettate, mai fuse.
5. **Niente backend, database server, o nuove dipendenze** oltre a quelle previste (React, Zod, Leaflet, D3) senza chiedere prima. Niente chiamate di rete a runtime salvo Ollama locale e API Sefaria dove previsto.
6. Dopo ogni modifica a schemi o dati: `npm run valida` deve passare. Un task non è chiuso con la validazione rossa.
7. Nessun comando con effetti fuori dalla cartella del progetto senza chiedere prima: niente kill di processi per nome/immagine (`taskkill /IM`, `pkill`), niente modifiche a file di configurazione globali, niente install globali. I processi avviati (es. dev server) si fermano solo per PID specifico.

## Stack e convenzioni

- React + Vite + **TypeScript**. Schemi dati: **Zod** in `src/tipi/`, unica fonte di verità; i tipi statici si derivano con `z.infer`. Niente definizioni di tipo duplicate a mano.
- Script Node in TypeScript (`scripts/*.ts`) eseguiti con `tsx`, così condividono gli schemi Zod di `src/tipi/`.
- Mappa: Leaflet + tile OSM. Timeline e genealogie: D3. Assistente: `fetch` verso `http://localhost:11434` (documentare `OLLAMA_ORIGINS` per il CORS). Preferenze utente: `localStorage`.
- ID, versificazione (sempre TM, rimappaggio TVTMS in import) e struttura cartelle: come da `docs/SCHEMI-DATI.md` §1 e §3.
- File generati `[G]`: sempre con blocco `meta` (fonte, licenza, data, script) e attribuzione CC BY 4.0 per i dati STEPBible. Mai editarli a mano: si corregge lo script e si rigenera.
- Nomi di campo dei dati: esattamente quelli degli schemi (non "migliorarli"). Nel codice: dominio dati in italiano coerente con gli schemi, resto a discrezione; commenti in italiano.
- Consegna **file completi**, non frammenti. Spiega in 2-4 righe le scelte architetturali non ovvie. Niente refactoring opportunistici fuori dal task.

## UI e design

- **Ogni task che tocca la UI usa le skill `frontend-design` e `ui-ux-pro-max`.** Se una delle due non risulta disponibile nell'ambiente, dirlo prima di procedere, non ripiegare in silenzio.
- `docs/DESIGN.md` è vincolante e **prevale** sulle indicazioni generiche delle skill: la direzione è sobria, da strumento di studio — niente gradienti decorativi, glassmorphism o animazioni non funzionali, anche se le skill li suggeriscono.
- Stile: CSS nativo con custom properties (design token in un unico file, come da DESIGN.md §4). Niente Tailwind, component library o altre dipendenze di stile senza chiedere prima.
- Mock, demo e screenshot non contengono mai testo biblico o traduzioni scritti a mano: solo dati già importati dal database o placeholder dichiaratamente finti (la regola non negoziabile 1 vale anche lì).

## Comandi

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run valida` → esegue `scripts/valida.ts` su `public/data/` e `bootstrap/`
- Import dati: `npx tsx scripts/import-<sorgente>.ts` (le sorgenti scaricate stanno in `scripts/sources/`, in `.gitignore`)

## Processo

- Un task della ROADMAP per sessione. A fine task: `npm run valida` verde, riepilogo breve di cosa è stato fatto e delle scelte prese, **stop**. Non iniziare il task successivo né la fase successiva senza ok esplicito.
- Task di curation (Fasi 2-3): produrre bozze JSON in `bootstrap/` con fonti per ogni claim e confidenza proposta, poi fermarsi per la revisione. Mai dare per approvato ciò che non lo è.
- Se un dato o un'API esterna non corrisponde a quanto atteso (formato TAHOT/TIPNR, termini Sefaria, edizione Luzzi): non improvvisare un workaround silenzioso — riporta il problema e proponi opzioni.
