# ROADMAP operativa

Regole di esecuzione:
- **Un task per sessione**, nell'ordine. A fine task: `npm run valida` verde (da F0.3 in poi), riepilogo breve, **stop**.
- Non iniziare il task o la fase successiva senza ok esplicito dell'utente.
- I task marcati **⏸ REVISIONE** producono bozze in `bootstrap/` e si fermano lì: lo spostamento in `public/data/` avviene solo dopo revisione umana.
- Aggiornare lo stato dei task in questo file (`[ ]` → `[x]`) man mano.

---

## Fase 0 — Fondamenta

- [x] **F0.1 Scaffold.** Vite + React + TypeScript; struttura cartelle come SCHEMI-DATI §3; dipendenze minime (react, react-dom, zod; dev: typescript, vite, tsx). Script npm: `dev`, `build`, `preview`, `valida` (placeholder). Leaflet e D3 NON ancora: si installano nella fase in cui servono.
  *Fatto quando:* `npm run dev` mostra la shell vuota dell'app e la struttura cartelle esiste (con `.gitkeep` dove serve), `.gitignore` copre `scripts/sources/` e `node_modules`.
- [x] **F0.2 Schemi Zod.** In `src/tipi/`: tutti gli schemi di SCHEMI-DATI §2, inclusi i tipi condivisi (`Fonte`, `Range`, enum confidenza, target polimorfo delle note) e i tipi derivati con `z.infer`.
  *Fatto quando:* compilazione pulita e tipi esportati; nessuna definizione di tipo duplicata a mano.
- [ ] **F0.3 Validatore.** `scripts/valida.ts`: valida ogni JSON presente in `public/data/` e `bootstrap/` contro gli schemi + controlli incrociati (riferimenti esistenti; reciprocità relazioni familiari; copertura contigua delle pericopi sul range curato; coerenza fonti ↔ `da_verificare`; chiavi traduzioni risolvibili su id TM). Output leggibile: file, record, errore.
  *Fatto quando:* `npm run valida` gira su un mini-dataset di prova (valido e volutamente rotto) con esiti corretti.
- [ ] **F0.4 Loader + stub morfologia.** `src/dati/`: caricamento JSON con cache per libro e hook React; `src/lib/morfologia.ts` con la decodifica di una prima manciata di codici comuni e fallback "codice non decodificato: <sigla>".
  *Fatto quando:* l'app carica un `verses/gen.json` di prova e lo mostra in forma grezza.

## Fase 1 — Import e vista lettura

- [ ] **F1.1 Import TAHOT.** Leggere la documentazione del formato nel repo STEPBible-Data; `scripts/import-tahot.ts` genera `verses/` e `words/` per i 5 libri, con `meta` e attribuzione. Documentare nel codice il mapping colonne→campi deciso.
  *Fatto quando:* validazione verde sull'intero Pentateuco; conteggi versetti/parole plausibili riportati nel riepilogo.
- [ ] **F1.2 Indice lemmi.** Estensione dell'import: `indices/lemmi.json` (chiave dStrong, occorrenze).
- [ ] **F1.3 Import TIPNR + OpenBible.** ⏸ REVISIONE — `scripts/import-tipnr.ts` produce bozze `places.json` e `people.json` in `bootstrap/` (luoghi con candidati e `peso_openbible`; persone con relazioni e riferimenti; tutto `da_verificare: true`, `status` NON assegnato automaticamente oltre un default prudente).
- [ ] **F1.4 Import Luzzi.** `scripts/import-luzzi.ts` con rimappaggio versificazione via TVTMS; genera `translations/luzzi.json` e aggiorna il manifest. Verificare fonte, edizione (1924/1927) e licenza; fissare l'anno nel `meta`.
  *Fatto quando:* controllo di completezza del validatore verde (nessun buco inatteso sui versetti TM).
- [ ] **F1.5 Import TSK.** `scripts/import-tsk.ts` → `crossrefs/` per libro, con flag `interno`.
- [ ] **F1.6 Vista lettura.** In due passi, con le skill `frontend-design` e `ui-ux-pro-max` attive e i vincoli di `docs/DESIGN.md`:
  **(a) ⏸ APPROVAZIONE — Sistema di design.** Design token (colori/spaziature/tipografia, inclusa la semantica dei 5 status), scelta motivata della font latina entro i vincoli di DESIGN.md §3, self-hosting del font ebraico con verifica visiva su versetti reali importati, mock statico (HTML/CSS) della vista lettura. Solo dati importati o placeholder dichiaratamente finti nei mock. **Stop: si implementa solo dopo l'ok.**
  **(b) Implementazione.** Colonna centrale (ebraico word-level cliccabile + traduzione a fronte), pannello parola (parsing leggibile, glossa EN etichettata, occorrenze del lemma navigabili via indice), colonna sinistra (navigazione libro/capitolo, selettore traduzione), persistenza ultima posizione e traduzione in `localStorage`.
  *Fatto quando:* si legge Genesi in ebraico + Luzzi, ogni parola apre il pannello con occorrenze funzionanti, e tutti gli stili passano dai token (nessun valore esadecimale nei componenti).

## Fase 2 — Contesto e curation Genesi 1–3

- [ ] **F2.1 Bozze curation Gen 1–3.** ⏸ REVISIONE — `events` (segmentazione in pericopi completa e contigua su Gen 1–3, tre assi compilati), `notes`, integrazione/correzione di `places`/`people` per il range. Ogni claim con fonti reali o `da_verificare: true`. Mai inventare fonti o consenso.
- [ ] **F2.2 Colonna contesto.** Tab Dove/Quando/Chi sincronizzati con la pericope visibile durante lo scroll, con miniature (minimappa con stile marker per status; tre assi in miniatura; mini-schede persone). Installazione Leaflet (e D3 se serve già qui).
- [ ] **F2.3 Traduzione letterale Gen 1–3.** Proposta pericope per pericope in sessione, approvazione esplicita dell'utente, solo poi scrittura in `translations/letterale.json`. Ambiguità reali → note, non risolte in silenzio.
- [ ] **F2.4 Note in UI.** Indicatori a margine per tipo/confidenza, pannello nota con badge, fonti, flag `da_verificare`; note `tradizione_ebraica` con link Sefaria (prima: verifica dei termini d'uso per l'eventuale caching).

## Fase 3 — Viste complete e curation Genesi 4–11

- [ ] **F3.1 Mappa completa.** Tutti i luoghi del range curato, filtri per status e capitolo, popup con candidati alternativi e fonti.
- [ ] **F3.2 Timeline a tre binari.** D3; incertezza resa come range/sfumature, mai punti secchi; binari etichettati.
- [ ] **F3.3 Genealogie.** Alberi Gen 5, 10, 11; età letterali come dato narrativo; note critiche agganciate; navigazione persona→versetti.
- [ ] **F3.4 Curation Gen 4–11.** ⏸ REVISIONE — stesso processo di F2.1, in blocchi piccoli (es. 4–6, 7–9, 10–11).

## Fase 4 — Assistente RAG

- [ ] **F4.1 Embeddings.** `scripts/gen-embeddings.ts` via Ollama (BGE-M3), sorgente: letterale + note curate; `embeddings.json` con meta.
- [ ] **F4.2 Retrieval + generazione.** Cosine similarity client-side, top-k, chiamata a Ollama con il system prompt del §9 della specifica; rilevamento disponibilità Ollama e istruzioni `OLLAMA_ORIGINS` documentate.
- [ ] **F4.3 Guardrail.** Post-verifica dei riferimenti (esistenza nel dataset + presenza nel contesto recuperato; altrimenti blocco/warning), inserimento dei versetti dal database (mai dal modello), banner permanente, riferimenti cliccabili.
  *Fatto quando:* un riferimento inventato ad arte viene bloccato; i versetti citati compaiono sempre dal database.

## Fase 5 — Rifinitura

- [ ] **F5.1 Ricerca** (testo traduzioni, lemmi, entità).
- [ ] **F5.2 Export/backup del dataset** curato.
- [ ] **F5.3 Pulizia finale** e README tecnico (setup, comandi, come aggiungere una traduzione personale, come rigenerare i dati).
