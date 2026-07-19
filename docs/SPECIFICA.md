# SPECIFICA — "Pentateuco in contesto"

Documento vincolante. Questa specifica è stata definita in dettaglio in fase di progettazione: **seguila fedelmente, non ridiscutere le decisioni architetturali già prese.** Lavora in italiano.

> **Nota di stato (18/07/2026).** Gli schemi abbozzati al §6 sono stati finalizzati in `docs/SCHEMI-DATI.md`, che in caso di differenze **prevale** su questo documento. Le fasi del §11 sono operativizzate task per task in `docs/ROADMAP.md`. La definizione degli schemi richiesta dalla Fase 0 è quindi già fatta; resta da eseguire la parte di setup.

## 1. Chi è l'utente

Lavora in IT, è autonomo con la documentazione tecnica e ha esperienza di sviluppo web (principalmente WordPress, ma questo progetto è deliberatamente su stack diverso). Ha un PC desktop con Ryzen 5 5600G, RX 6750 XT 12 GB, 32 GB RAM, e usa Ollama in locale. L'app è per uso personale, desktop-first.

## 2. Visione

Un'app di lettura del Pentateuco in cui **il contesto è sempre visibile accanto al testo**: dove (geografia), quando (tempo), chi (persone e genealogie), cosa dice davvero l'originale ebraico — con **note oneste sul grado di certezza** di ogni informazione secondo la scholarship aggiornata. Il problema che risolve: i tool esistenti o sono devozionali (nessun apparato critico) o sono accademici ma frammentati e costosi; nessuno mostra l'incertezza come dato di prima classe.

## 3. Principi non negoziabili

1. **L'incertezza è un dato di prima classe.** Ogni luogo, data, identificazione e affermazione storica porta un livello di confidenza esplicito e visibile in UI. Scala: `consensus` (consenso accademico ampio) / `majority` (posizione maggioritaria con dissenso rilevante) / `disputed` (dibattito aperto tra più posizioni) / `speculative` (ipotesi minoritaria o tradizionale senza supporto critico) / `symbolic` (elemento narrativo-simbolico, non localizzabile/databile per natura, es. Eden).
2. **Tre assi temporali distinti, mai confusi:** (a) *tempo narrato* — quando avvengono gli eventi secondo il racconto, con le cronologie interne del testo prese alla lettera come dato letterario; (b) *tempo storico-critico* — cosa di quel narrato è ancorabile a storia verificabile, con onestà sul fatto che per patriarchi ed Esodo come narrati la scholarship mainstream non riconosce ancoraggi diretti; (c) *tempo di composizione* — quando i testi sono stati scritti e redatti, presentando il ventaglio del dibattito (ipotesi documentaria classica e sue revisioni, modelli supplementari, datazioni persiane) senza sceglierne dogmaticamente uno.
3. **Il testo biblico non viene mai generato da un LLM.** In ogni punto dell'app, i versetti provengono dal database. Questo vale anche per il modulo assistente (v. §9).
4. **Ogni nota del dataset cita le sue fonti** (autore/opera/anno, o link a risorsa aperta). Le note senza fonte sono marcate `da_verificare` e visivamente distinte.
5. **Prospettive incluse nelle note:** scholarship storico-critica accademica + tradizione esegetica ebraica classica (Rashi, Ibn Ezra, Ramban e simili, via API Sefaria). Le due prospettive sono etichettate e distinguibili, mai fuse. Niente apparato confessionale cristiano nell'MVP.
6. **Le traduzioni moderne non vengono mai generate o ricostruite dall'LLM.** Traduzioni come la CEI 2008 / Bibbia di Gerusalemme entrano nell'app esclusivamente come file forniti dall'utente tramite lo slot traduzioni (v. §7): un LLM che le "ricorda" produce testo inaffidabile, e il testo di una traduzione deve essere esatto o non essere.

## 4. Scope MVP

- **Tutte le funzionalità dell'app vengono costruite complete** (lettura, parola-per-parola, mappa, timeline, genealogie, note, assistente).
- **I dati curati coprono inizialmente solo Genesi 1–11.** Il testo ebraico e la struttura libro/capitolo/versetto vengono invece importati per tutto il Pentateuco fin da subito (l'import è automatico, la curation no).
- L'espansione della curation (Genesi 12–50, poi Esodo ecc.) avviene dopo, con lo stesso schema.

## 5. Stack tecnico

- **SPA statica: React + Vite.** Nessun backend. Deve girare da hosting statico o filesystem locale.
- **Dati: file JSON statici** in `/public/data/`, caricati a runtime. Niente database server.
- **Mappa: Leaflet** con tile OpenStreetMap.
- **Timeline e alberi genealogici: D3.**
- **Assistente LLM: chiamate dirette dal browser a Ollama locale** (`http://localhost:11434`), attivabile/disattivabile. Documentare la configurazione `OLLAMA_ORIGINS` necessaria per il CORS.
- Persistenza preferenze utente (traduzione selezionata, ultima posizione di lettura): `localStorage`.
- Lingua UI: italiano.

## 6. Modello dati

Bozza originaria degli schemi — **finalizzata in `docs/SCHEMI-DATI.md`, che prevale**:

- **`verses.json`** — per versetto: `id` (es. `gen.1.1`), libro, capitolo, numero, array di word-id.
- **`words.json`** — per parola ebraica (fonte: **STEPBible TAHOT**, CC BY 4.0 — Codex Leningradensis via Westminster/OpenScriptures, corretto su scansioni a colori, con tagging morfologico e semantico completo di prefissi e suffissi, dStrong, glosse e varianti Ketiv/Qere): `id`, testo ebraico, lemma, dStrong, parsing morfologico, traslitterazione, glossa.
- **`places.json`** — per luogo: `id`, nomi (ebraico, italiano), **candidati di localizzazione multipli** ciascuno con coordinate, argomenti a favore/contro e fonti; `status` (scala §3.1); riferimenti ai versetti. Bootstrap iniziale da **TIPNR** + coordinate e punteggi di confidenza di **OpenBible.info geo**; lo `status` critico finale resta assegnato in curation.
- **`people.json`** — per persona: `id`, nomi, relazioni (padre/madre/figli/coniugi), riferimenti ai versetti, note (incluse le età letterali del testo dove date, trattate come dato narrativo). Bootstrap iniziale da **TIPNR**, che fornisce già disambiguazione degli omonimi, relazioni familiari e riferimenti esaustivi.
- **`events.json`** — per evento/pericope: `id`, range di versetti, titolo, posizione sui **tre assi temporali** (narrato: riferimenti cronologici interni; storico-critico: ancoraggio o esplicita assenza di ancoraggio, con confidenza; composizione: range e scuole), fonti.
- **`notes.json`** — nota: `id`, target (versetto, pericope, luogo, persona o parola), `tipo` (`filologica` / `storica` / `geografica` / `tradizione_ebraica` / `divergenza_traduttiva`), testo, `confidence` (scala §3.1), fonti, flag `da_verificare`.
- **`translations/*.json`** — una traduzione per file: metadata (nome, anno, licenza) + mappa versetto→testo. Lo schema è **pluggable**: l'app carica qualsiasi file conforme presente nella cartella.
- **`crossrefs.json`** — riferimenti incrociati (base: Treasury of Scripture Knowledge, pubblico dominio), con campo `tipo` quando curato (citazione/allusione/parallelo tematico).
- **`embeddings.json`** — vettori precomputati per versetti e note, per il retrieval client-side del modulo assistente (v. §9).

Nota per il parsing: TAHOT e TIPNR sono file tab-separated con header documentati nel repository; leggi la documentazione del formato prima di scrivere gli script di import.

## 7. Traduzioni

- **Traduzione letterale di lavoro** (`translations/letterale.json`): costruita insieme all'utente, pericope per pericope, man mano che si curano i capitoli. L'assistente propone una resa letterale dall'ebraico (aderenza massima al testo masoretico, anche a costo di italiano ruvido; ambiguità reali segnalate in nota, non risolte silenziosamente), l'utente la revisiona e approva. Copre solo i capitoli curati.
- **Riveduta Luzzi 1924** (pubblico dominio): traduzione italiana completa di fallback per tutto il Pentateuco.
- **Slot personale:** qualsiasi traduzione in possesso dell'utente (es. CEI 2008 / Bibbia di Gerusalemme) entra come file conforme allo schema, preparato a partire dal testo che possiede. L'assistente fornisce script di conversione/parsing e validazione dello schema; non tenta mai di generare o ricostruire a memoria il testo di queste traduzioni.
- L'ebraico masoretico word-level resta la fonte di verità primaria; le traduzioni sono viste derivate.
- Le **note di tipo `divergenza_traduttiva`** segnalano i punti dove le traduzioni correnti si discostano in modo significativo dal TM letterale, spiegando la natura della scelta (armonizzazione, influenza LXX/Vulgata, scelta interpretativa).

## 8. UI (desktop-first)

Layout a tre colonne:

- **Colonna sinistra (stretta):** navigazione libro/capitolo, ricerca, selettore traduzioni.
- **Colonna centrale (lettura):** testo ebraico TM con **ogni parola cliccabile**, traduzione a fronte (quella selezionata). Indicatori discreti a margine dove esistono note, con colore/icona per tipo e confidenza.
- **Colonna destra (contesto, sincronizzata con la pericope visibile durante lo scroll):** tre tab — **Dove** (minimappa dei luoghi della pericope, con stile del marker che riflette lo status: pieno = identificato, tratteggiato = conteso, assente/segnaposto dedicato = simbolico; click → vista mappa completa), **Quando** (posizione della pericope sui tre assi temporali, in miniatura; click → timeline completa), **Chi** (personaggi della pericope con mini-schede; click → albero genealogico centrato sulla persona).

Click su una parola ebraica → pannello dettaglio: lemma, traslitterazione, parsing morfologico leggibile (non solo sigle), glossa, **tutte le occorrenze del lemma nel Pentateuco** (navigabili), link alla voce Sefaria quando pertinente.

Viste dedicate a schermo pieno, raggiungibili dai pannelli contesto:

- **Mappa** (Leaflet): tutti i luoghi del range curato, filtri per status e per capitolo, popup con candidati alternativi e fonti.
- **Timeline** (D3): tre binari paralleli etichettati (tempo del racconto / ancoraggi storici / composizione dei testi), con le entità posizionate secondo `events.json` e l'incertezza resa visivamente (range, sfumature), mai come punti secchi.
- **Genealogie** (D3): alberi di Gen 5, 10 (Tavola delle Nazioni) e 11, con le età letterali del testo mostrate come dato narrativo e note critiche agganciate; navigazione persona→versetti.

Ogni nota mostra sempre: tipo, badge di confidenza, fonti, eventuale flag `da_verificare`.

## 9. Modulo assistente (RAG rigido)

Pannello separato dalla lettura, attivabile solo se Ollama risponde in locale.

- **Retrieval client-side:** embedding precomputati in build (modello: BGE-M3 o E5-multilingual via Ollama) salvati in `embeddings.json`; cosine similarity in JavaScript nel browser; recupero dei top-k tra versetti e note curate.
- **Generazione:** chiamata a Ollama locale con modello 8–14B quantizzato (default suggerito: Qwen2.5 14B q4 o Llama 3.1 8B). Il system prompt impone: rispondere **solo** dal contesto fornito; ogni affermazione seguita dal riferimento tra parentesi quadre (es. `[Gen 6:4]`, `[nota:ngen64-01]`); se il contesto non basta, dichiarare esplicitamente "non ho materiale curato su questo aspetto"; **mai riprodurre il testo dei versetti** — l'app li inserisce dal database quando citati.
- **Post-verifica automatica:** il codice estrae tutti i riferimenti dalla risposta e verifica che (a) esistano nel dataset e (b) fossero presenti nel contesto recuperato. Riferimenti non verificabili → risposta bloccata o marcata con warning evidente.
- **UI:** banner permanente "Sintesi automatica — verifica le fonti citate"; ogni riferimento è cliccabile e apre versetto/nota.
- L'assistente conosce solo ciò che è stato curato: all'inizio, Genesi 1–11. Questo è un comportamento corretto, non un bug.

## 10. Fonti dati

- **Ebraico + morfologia:** **STEPBible-Data TAHOT** (`github.com/STEPBible/STEPBible-Data`, CC BY 4.0), file tab-separated. Serve uno script di import (Node) dai TSV ai nostri JSON. OSHB/morphhb resta il riferimento a monte, ma TAHOT lo incorpora già con correzioni e tagging più ricco.
- **Commentatori ebraici classici:** API Sefaria (aperta). Le note di tipo `tradizione_ebraica` linkano e riassumono; verificare i termini d'uso per l'eventuale caching locale.
- **Traduzione Luzzi 1924:** pubblico dominio, reperibile in progetti open (es. moduli SWORD/CrossWire); serve script di conversione.
- **Cross-reference:** Treasury of Scripture Knowledge (pubblico dominio).
- **Nomi propri, genealogie, luoghi:** **TIPNR** (STEPBible-Data, CC BY 4.0) per persone/luoghi/cose disambiguati, con relazioni familiari e riferimenti esaustivi; **OpenBible.info geo** per coordinate con punteggi di confidenza sulle identificazioni. Attenzione: le descrizioni discorsive incluse in TIPNR sono generate da AI — usarle al massimo come bozze da verificare, mai come fonti.
- **Eventi, datazioni, status critici e note: qui non esiste un dataset pronto — li costruiamo noi.** TIPNR e OpenBible danno lo scheletro (chi e dove, con coordinate), ma i tre assi temporali, gli status di certezza finali e le note critiche restano lavoro di curation. Processo: l'assistente genera bozze JSON conformi agli schemi, con fonti citate per ogni claim e confidenza proposta; l'utente le revisiona, corregge e approva prima dell'inserimento. **Non inventare mai dati:** senza una fonte solida per un'affermazione, marcare `da_verificare` e dirlo. Riferimenti utili per la curation: voci tipo Anchor Yale Bible Dictionary, Bible Odyssey (SBL), letteratura accademica corrente.

## 11. Processo di lavoro

Si procede per fasi e, per ogni sessione: task piccoli e chiusi, codice completo dei file toccati (non frammenti), spiegazione breve delle scelte architetturali non ovvie.

1. **Fase 0** — setup progetto (Vite + React), struttura cartelle, definizione finale degli schemi JSON. *(Schemi: già finalizzati in `SCHEMI-DATI.md`.)*
2. **Fase 1** — script di import TAHOT per tutto il Pentateuco; import TIPNR (persone/luoghi) e Luzzi; vista lettura con ebraico word-level + traduzione a fronte + pannello parola.
3. **Fase 2** — curation Genesi 1–3: prime bozze di places/people/events/notes che l'utente revisiona; pannelli contesto (Dove/Quando/Chi) sincronizzati; traduzione letterale di Gen 1–3.
4. **Fase 3** — viste complete mappa, timeline a tre assi, genealogie; curation estesa a Gen 4–11.
5. **Fase 4** — modulo assistente RAG con tutti i guardrail del §9.
6. **Fase 5** — rifinitura, ricerca, export/backup del dataset.

I task operativi, fase per fase, sono in `docs/ROADMAP.md`.

## 12. Cosa non fare

- Non generare mai testo biblico a memoria, in nessun componente.
- Non inventare coordinate, datazioni, identificazioni o consenso accademico: ogni claim ha fonte o flag `da_verificare`.
- Non presentare come certa nessuna informazione classificata sotto `consensus`.
- Non generare né ricostruire a memoria il testo di traduzioni moderne (CEI 2008, Bibbia di Gerusalemme, ecc.): entrano nell'app solo come file forniti dall'utente.
- Non fondere i tre assi temporali in un'unica linea.
- Non trasformare l'app in un aggregatore devozionale: il taglio è critico-filologico più tradizione ebraica classica, etichettate separatamente.
- Non aggiungere backend, database server o dipendenze pesanti non previste senza discuterne.
