# Assistente RAG — setup e funzionamento

Modulo assistente della specifica §9. Risponde **solo** sul materiale curato (al momento
Genesi 1–11) e non tocca la rete se non per parlare con **Ollama in locale**. Nessun
servizio remoto, nessuna chiave.

## Prerequisiti

1. **Ollama** installato e in esecuzione (`ollama serve`), in ascolto su
   `http://localhost:11434`.
2. **Modello di embedding** `bge-m3` — lo stesso con cui è stato generato
   `public/data/embeddings.json` (vedi `scripts/gen-embeddings.ts`, task F4.1):

   ```bash
   ollama pull bge-m3
   ```

3. **Un modello di generazione** 8–14B quantizzato (la specifica §9 suggerisce
   Qwen2.5 14B q4 o Llama 3.1 8B; va bene qualunque generalista installato). Modello in
   uso in questo progetto: **Gemma 3 12B, variante QAT** (`gemma3:12b-it-qat`):

   ```bash
   ollama pull gemma3:12b-it-qat   # oppure: qwen2.5:14b, llama3.1:8b, …
   ```

   Il selettore «Modello di generazione» nel pannello elenca i modelli installati (escluso
   quello di embedding). La scelta viene ricordata tra le sessioni (`localStorage`,
   chiave `assistente-modello-gen`); al primo avvio, senza una scelta salvata, ne propone
   uno ragionevole.

## CORS: `OLLAMA_ORIGINS` (il punto che blocca)

Le richieste partono dal **browser** verso `http://localhost:11434`, che è un'origine
diversa da quella dell'app. Ollama deve dichiararla lecita, altrimenti il browser blocca la
risposta e l'assistente appare «non raggiungibile» (dal lato JavaScript un server spento e
un'origine non ammessa danno lo stesso errore).

Ollama ammette **di default** le origini `localhost`/`127.0.0.1`, quindi in sviluppo su
`http://localhost:5173` di norma non serve fare nulla. Serve invece impostare
`OLLAMA_ORIGINS` quando l'app è servita da un'altra origine (build su un'altra porta, host
di rete, dominio):

- **Windows (PowerShell/persistente):**

  ```powershell
  setx OLLAMA_ORIGINS "http://localhost:5173"
  ```

  `setx` vale dalle sessioni successive: chiudi e riapri il terminale, poi riavvia Ollama.
  Per la sola sessione corrente: `$env:OLLAMA_ORIGINS = "http://localhost:5173"`.

- **macOS:** `launchctl setenv OLLAMA_ORIGINS "http://localhost:5173"` e riavvio dell'app
  Ollama.
- **Linux (systemd):** `Environment="OLLAMA_ORIGINS=http://localhost:5173"` nel service, poi
  `systemctl daemon-reload && systemctl restart ollama`.

Più origini si separano con la virgola. `*` ammette tutto: comodo solo in sviluppo.
Il pannello mostra queste istruzioni con l'origine reale della pagina quando Ollama non
risponde.

> Nota: da una pagina servita in **https** il browser blocca le chiamate in chiaro a
> `http://localhost:11434` (mixed content). In sviluppo (http) non è un problema.

## Come funziona (F4.2)

1. La domanda viene trasformata in un embedding con `bge-m3` (stesso spazio dei vettori
   precomputati).
2. Cosine similarity client-side su `embeddings.json` → top-k tra versetti (traduzione
   letterale) e note curate. I vettori sono normalizzati, quindi la similarità è un prodotto
   scalare.
3. Il contesto recuperato e la domanda vanno a Ollama (`/api/chat`, in streaming) con il
   system prompt del §9: risponde solo dal contesto, cita ogni affermazione con il
   riferimento tra parentesi quadre (`[Genesi 1,1]`, `[nota:id]`), dichiara i vuoti, **non**
   riproduce il testo dei versetti.

## Guardrail (F4.3)

Il modello non è mai la fonte del testo biblico. A risposta conclusa, prima di mostrarla,
il codice la ri-analizza (`analizzaRisposta` in `src/lib/rag.ts`):

- **Post-verifica dei riferimenti.** Ogni `[...]` viene ricondotto al dataset e classificato:
  - _versetto/nota recuperati_ → verificati, resi **cliccabili** (il versetto apre il testo,
    la nota si espande in linea col proprio testo dal database);
  - _fuori dal contesto_ → esistono nel dataset ma non erano tra i passi recuperati (il
    modello li ha portati da fuori) → **segnalati**;
  - _inesistenti_ → non risolvibili nel dataset (riferimento inventato) → **segnalati**.
  I riferimenti non verificati sono marcati in linea e riepilogati in cima alla risposta con
  un avviso evidente (non vengono nascosti: si vede che il modello ha sbagliato).
- **Versetti dal database.** Il testo di un versetto citato è **sempre** quello del database
  (traduzione letterale), inserito in linea alla prima citazione; il modello non lo produce
  mai (glielo vieta il system prompt del §9, e comunque non verrebbe usato).
- **Banner permanente** «Sintesi automatica — verifica le fonti citate», sempre visibile nel
  pannello.

Il formato dei riferimenti è quello di tutta l'app (`[Genesi 1,1]`, `[nota:id]`), non la
forma inglese degli esempi della specifica: una sola convenzione è più verificabile.

## Rigenerare i vettori

Dopo aver ampliato la curation (letterale o note), rigenera `embeddings.json` con Ollama
attivo e `bge-m3` installato:

```bash
npx tsx scripts/gen-embeddings.ts
```
