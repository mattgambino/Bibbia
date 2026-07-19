# SCHEMI DATI — v1 (18/07/2026)

**Riferimento vincolante.** In caso di differenze con la bozza del §6 della specifica, prevale questo documento. Gli esempi sono **illustrativi**: mostrano la *forma* dei dati, non dati curati — valori, coordinate, pesi e fonti negli esempi sono segnaposto e non vanno mai copiati come dati reali.

---

## 1. Convenzioni trasversali

**Codici libro.** `gen`, `exo`, `lev`, `num`, `deu`.

**ID.**
- Versetto: `gen.1.1` → `libro.capitolo.versetto`, numerazione **TM/BHS**, canonica in tutta l'app.
- Parola: `gen.1.1.01` → posizione a due cifre nel versetto, in ordine di lettura.
- Entità curate (luoghi, persone, eventi, note): slug minuscolo ASCII, con disambiguatore dove esistono omonimi (`lemek.gen4` vs `lemek.gen5`). Il campo `tipnr_id` conserva la chiave TIPNR d'origine, così il legame col dataset non si perde.

**Versificazione.** Gli id sono sempre TM. Le traduzioni con versificazione diversa vengono **rimappate in fase di import** usando TVTMS (il dataset di mapping versificazioni di STEPBible-Data). Le divergenze nel Pentateuco esistono e non sono marginali (p.es. Gen 32, Es 8 e 22, Lv 5–6, Nm 17, Dt 13/23/29). Nell'app non circolano mai doppie numerazioni.

**Anni.** Interi; negativo = a.e.v. (`-586` = 586 a.e.v.). L'asse narrato usa l'**Anno Mundi** (`am`), calcolato aritmeticamente dal TM, come dato letterario.

**Tipi condivisi.**

`Fonte` — identico in tutti i file:

```jsonc
{
  "tipo": "opera" | "url" | "dataset",
  "autore": "…",                      // opzionale (anche per tipo "opera")
  "titolo": "…",                      // obbligatorio
  "anno": 1989,                        // opzionale
  "url": "https://…",                 // obbligatorio se tipo = "url"
  "dettaglio": "pp. 45-47 / s.v. 'Eden'"  // opzionale
}
```

`Range` di versetti (estremi inclusi):

```jsonc
{ "da": "gen.6.9", "a": "gen.9.17" }
```

**Scala di confidenza** (§3.1 della specifica, invariata): `consensus` | `majority` | `disputed` | `speculative` | `symbolic`.

**`da_verificare`.** Boolean su ogni record curato. Regola imposta dal validatore: un record con affermazioni prive di fonti **deve** avere `da_verificare: true`.

**Generati vs curati.** Due classi rigide di file:
- *Generati* `[G]` dagli script: rigenerabili, mai editati a mano. Portano un blocco `meta` con dataset d'origine, licenza (attribuzione CC BY 4.0 per i dati STEPBible), data e versione dello script (`script` è sempre presente, non opzionale).
- *Curati* `[C]`: mai toccati dagli script. Le bozze che gli script producono per la curation finiscono in `bootstrap/`, fuori da `public/`, ed entrano in `public/data/` solo dopo revisione umana. Nessuna rigenerazione può sovrascrivere lavoro approvato.

---

## 2. Schemi per file

### 2.1 `verses/<libro>.json` — `[G]` (TAHOT)

```jsonc
{
  "meta": { "fonte": "STEPBible TAHOT", "licenza": "CC BY 4.0", "generato": "2026-07-18", "script": "import-tahot v0.1" },
  "libro": "gen",
  "nome_it": "Genesi",
  "capitoli": 50,
  "versetti": [
    { "id": "gen.1.1", "capitolo": 1, "numero": 1, "parole": ["gen.1.1.01", "gen.1.1.02", "…"] }
  ]
}
```

### 2.2 `words/<libro>.json` — `[G]` (TAHOT)

```jsonc
{
  "meta": { "…": "come sopra" },
  "parole": [
    {
      "id": "gen.1.1.01",
      "verso": "gen.1.1",
      "pos": 1,
      "testo": "בְּרֵאשִׁית",           // vocali e accenti come nel dato TAHOT
      "translit": "bərēʾšîṯ",
      "morph": "HR/Ncfsa",              // codice grammaticale grezzo
      "morfemi": [                       // segmentazione prefissi/suffissi come data da TAHOT
        { "strong": "H9003", "lemma": "בְּ", "glossa_en": "in" },
        { "strong": "H7225", "lemma": "רֵאשִׁית", "glossa_en": "beginning" }
      ],
      "ketiv": null,                     // valorizzati solo dove esiste la variante
      "qere": null
    }
  ]
}
```

Note di progetto:
- Il pannello parola mostra il parsing **leggibile**: `morph` viene decodificato a runtime da una tabella in `src/lib/morfologia.ts` (sigle → italiano). Il dato grezzo resta nel file; la leggibilità è responsabilità dell'app.
- Le glosse sono in inglese perché è ciò che TAHOT fornisce; in UI vengono etichettate come tali. L'italiano cresce **per lemma** tramite `lexicon_it.json` (§2.9), non riscrivendo ~80.000 record parola.
- Il mapping esatto colonne TAHOT → questi campi si fissa leggendo la documentazione del formato nel repository STEPBible quando si scrive `import-tahot.ts` (come prevede la specifica §6). I campi qui sopra sono i **nostri**, stabili: è lo script che si adatta al formato sorgente, non viceversa. Se il sorgente contiene informazioni che non stanno in questi campi, riportarlo e proporre, non estendere lo schema in silenzio.

### 2.3 `places.json` — `[C]` (bootstrap: TIPNR + OpenBible.info geo)

```jsonc
[
  {
    "id": "eden",
    "tipnr_id": "…",
    "nomi": { "he": "עֵדֶן", "translit": "ʿēḏen", "it": "Eden" },
    "status": "symbolic",
    "candidati": [
      {
        "id": "eden.golfo-persico",
        "etichetta": "Bassa Mesopotamia / testa del Golfo Persico",
        "lat": 30.99, "lon": 47.44,
        "pro": ["quadro fluviale di Gen 2,10-14 (Tigri, Eufrate)"],
        "contro": ["Pishon e Ghichon senza identificazione non forzata"],
        "peso_openbible": 0.4,           // opzionale: assente = candidato non presente nel dataset OpenBible
        "fonti": []
      }
    ],
    "riferimenti": ["gen.2.8", "gen.2.10", "gen.3.23", "gen.4.16"],
    "fonti": [],
    "da_verificare": true
  }
]
```

Note di progetto:
- Con `status: "symbolic"` i candidati possono esserci (proposte storiche di localizzazione, presentate come tali) o mancare del tutto; la mappa usa il segnaposto dedicato previsto dalla specifica §8.
- `peso_openbible` è il punteggio di confidenza del dataset OpenBible (0–1) e resta distinto dallo `status` critico, che si assegna in curation. Due cose diverse, due campi diversi. Il campo è opzionale: quando un candidato non è presente nel dataset OpenBible il campo si omette, non si inventa un punteggio.

### 2.4 `people.json` — `[C]` (bootstrap: TIPNR)

```jsonc
[
  {
    "id": "noach",
    "tipnr_id": "…",
    "nomi": { "he": "נֹחַ", "translit": "nōaḥ", "it": "Noè" },
    "relazioni": { "padre": "lemek.gen5", "madre": null, "coniugi": [], "figli": ["shem", "cham", "yefet"] },
    "riferimenti": ["gen.5.29", "gen.6.9", "…"],
    "dati_narrativi": {
      "eta_totale": 950,
      "eta_al_primo_figlio": 500,
      "versetti": ["gen.5.32", "gen.9.29"]
    },
    "fonti": [],
    "da_verificare": true
  }
]
```

Note di progetto:
- `relazioni` è volutamente denormalizzato (padre/madre/figli/coniugi tutti espliciti): rende banale il rendering degli alberi. Il validatore controlla la reciprocità (se A è padre di B, B deve essere tra i figli di A).
- `dati_narrativi` conserva le età letterali del TM dove il testo le dà, come dato del racconto — coerente col principio dei tre assi. Intero blocco `null` per le persone di cui il TM non dà età; `eta_totale` ed `eta_al_primo_figlio` sono a loro volta nullable indipendentemente (una persona può avere `versetti` ma solo una delle due età, o nessuna).

### 2.5 `events.json` — `[C]`

```jsonc
[
  {
    "id": "diluvio",
    "titolo": "Il diluvio",
    "range": { "da": "gen.6.9", "a": "gen.9.17" },
    "persone": ["noach", "shem", "cham", "yefet"],
    "luoghi": ["ararat"],
    "tempo_narrato": {
      "am": { "da": 1656, "a": 1657 },  // nullable: null per eventi non ancorabili ad Anno Mundi
      "riferimenti_interni": ["gen.7.6", "gen.7.11", "gen.8.13"],
      "nota": "Cronologia interna a date di mese/giorno; numeri secondo il TM (le varianti LXX / Pentateuco samaritano vanno in note filologiche)."  // nullable
    },
    "tempo_storico": {
      "ancoraggio": null,               // null = nessun ancoraggio; altrimenti { "da": -1300, "a": -1200 }
      "confidence": "consensus",
      "sintesi": "…",
      "fonti": []
    },
    "composizione": {
      "range": { "da": -700, "a": -400 },
      "posizioni": [
        { "etichetta": "Ipotesi documentaria classica", "sintesi": "…", "fonti": [] },
        { "etichetta": "Modelli supplementari / datazioni persiane", "sintesi": "…", "fonti": [] }
      ]
    },
    "fonti": [],
    "da_verificare": true
  }
]
```

Note di progetto:
- `tempo_narrato` non ha `confidence`: la cronologia interna è un dato **testuale**, certo in quanto testo, non un'affermazione storica. È `tempo_storico` a portare la confidenza — anche quando qualifica un'*assenza* di ancoraggio (`ancoraggio: null` + `confidence: "consensus"` = "il consenso è che non c'è ancoraggio"). `tempo_narrato.am` e `tempo_narrato.nota` sono entrambi nullable: non tutti gli eventi hanno un ancoraggio in Anno Mundi o richiedono una nota sulla cronologia interna.
- `composizione.range` rende l'incertezza come intervallo per la timeline; `posizioni` porta il ventaglio del dibattito, mai una scuola sola.
- Gli eventi fanno anche da **segmentazione in pericopi** per la colonna contesto sincronizzata: sul range curato la copertura deve essere completa e senza buchi (controllo nel validatore). Non tutte le pericopi sono "eventi" in senso forte (una genealogia è una pericope): va bene, la collezione copre entrambi.

### 2.6 `notes.json` — `[C]`

```jsonc
[
  {
    "id": "gen64-nefilim-01",
    "target": { "tipo": "versetto", "ref": "gen.6.4" },
    // altri target ammessi:
    // { "tipo": "pericope", "ref": { "da": "gen.6.1", "a": "gen.6.4" } }
    // { "tipo": "luogo",    "ref": "eden" }
    // { "tipo": "persona",  "ref": "noach" }
    // { "tipo": "parola",   "ref": "gen.6.4.03" }
    "tipo": "filologica",   // filologica | storica | geografica | tradizione_ebraica | divergenza_traduttiva
    "titolo": "…",
    "testo": "…",
    "confidence": "disputed",
    "commentatore": null,    // per tradizione_ebraica: "Rashi" | "Ibn Ezra" | "Ramban" | …
    "sefaria_ref": null,     // per tradizione_ebraica: es. "Rashi on Genesis 6:4:1"
    "fonti": [],
    "da_verificare": false
  }
]
```

Note di progetto: la separazione delle prospettive (specifica §3.5) è codificata dal `tipo` — `tradizione_ebraica` da un lato, gli altri quattro tipi (storico-critici) dall'altro. Se in curation emergesse il bisogno di sottotipizzare le note della tradizione, si aggiungerà un campo allora, non ora.

### 2.7 `translations/`

Manifest, `[C]` a mano (una voce per traduzione installata — necessario perché un hosting statico non può elencare il contenuto di una cartella):

```jsonc
// translations/index.json
{ "disponibili": ["letterale", "luzzi"] }
```

File traduzione, uno per file. `luzzi` `[G]`; `letterale` `[C]`; gli slot personali (CEI 2008 ecc.) generati dallo script di conversione sul testo fornito dall'utente:

```jsonc
{
  "meta": { "id": "luzzi", "nome": "Riveduta (Luzzi)", "anno": 1927, "lingua": "it", "licenza": "pubblico dominio", "completa": true },  // anno nullable
  "testi": {
    "gen.1.1": "…",
    "gen.1.2": "…"
  }
}
```

Note di progetto:
- Le chiavi sono **sempre** id TM, già rimappati via TVTMS in fase di import.
- `letterale.json` ha `completa: false` e copre solo i capitoli curati. Le ambiguità reali della resa vanno in note (`filologica` o `divergenza_traduttiva`), mai dentro il testo: il testo della traduzione resta pulito.
- `meta.anno` è nullable: per una traduzione senza un anno di pubblicazione univoco (es. la letterale, costruita in sessione) il campo è `null`.

### 2.8 `crossrefs/<libro>.json` — `[G]` (TSK), arricchibile in curation

```jsonc
{
  "meta": { "fonte": "Treasury of Scripture Knowledge", "licenza": "pubblico dominio", "generato": "…", "script": "import-tsk v0.1" },
  "riferimenti": [
    { "da": "gen.1.1", "a": "psa.33.6", "interno": false, "tipo": null, "curato": false }
  ]
}
```

Note di progetto:
- `interno: true` = destinazione nel Pentateuco, navigabile in app; i riferimenti esterni (qui `psa` = Salmi) restano visibili come etichette non navigabili. `tipo` (`citazione` | `allusione` | `parallelo_tematico`) si valorizza solo in curation, come da specifica.
- `meta.script` è sempre presente, come per gli altri file `[G]` (§1).
- Il codice libro di `a` ammette anche la forma con cifra iniziale (es. `1sa.3.1` per 1 Samuele), oltre ai tre codici a lettere del Pentateuco e degli altri libri; la verifica puntuale dell'insieme completo dei codici reali è rimandata a F1.5 (import TSK).

### 2.9 `indices/lemmi.json` `[G]` + `lexicon_it.json` `[C]`

```jsonc
// indices/lemmi.json — derivato da TAHOT: blocco meta per l'attribuzione CC BY 4.0, poi dizionario chiave dStrong
{
  "meta": { "fonte": "STEPBible TAHOT", "licenza": "CC BY 4.0", "generato": "2026-07-18", "script": "import-tahot v0.1" },
  "lemmi": {
    "H7225": {
      "lemma": "רֵאשִׁית",
      "translit": "rēʾšîṯ",
      "glossa_en": "beginning",
      "occorrenze": ["gen.1.1.01", "…"]
    }
  }
}
```

```jsonc
// lexicon_it.json — solo i lemmi già curati, dizionario piatto senza blocco meta (curato a mano, non derivato da TAHOT)
{
  "H7225": { "glossa_it": "principio, inizio", "fonti": [], "da_verificare": false }
}
```

Motivo: il pannello parola deve mostrare "tutte le occorrenze del lemma nel Pentateuco" al click, e farlo scorrendo i cinque file `words/` (≈25–30 MB complessivi) a ogni click non è realistico. L'indice si genera all'import, con lo stesso blocco `meta` con attribuzione CC BY 4.0 degli altri file `[G]` derivati da TAHOT (§1). Il lexicon separato è `[C]` e permette alle glosse italiane di crescere per lemma senza toccare file rigenerabili; non porta `meta` perché non deriva da un dataset generato.

### 2.10 `embeddings.json` — `[G]` (a partire dalla curation)

```jsonc
{
  "meta": { "modello": "bge-m3", "dim": 1024, "normalizzati": true, "testo_sorgente": "traduzione letterale + testo delle note", "generato": "…" },
  "voci": [
    { "tipo": "versetto", "ref": "gen.1.1",          "v": [0.0132, -0.0871, "…"] },
    { "tipo": "nota",     "ref": "gen64-nefilim-01", "v": ["…"] }
  ]
}
```

Note di progetto:
- Si embedda la **letterale** più il testo delle note, non l'ebraico: è esattamente il materiale che l'assistente ha il permesso di usare, e le query saranno in italiano. Coerente col fatto che l'assistente conosce solo il curato.
- Float arrotondati a 6 decimali. Per Gen 1–11 (~300 versetti + note) il JSON pesa pochi MB: accettabile. Quando la curation crescerà, è previsto il passaggio a un file binario `.bin` (Float32Array) con indice JSON a fianco — decisione rinviata, ma il formato attuale non scala all'intero Pentateuco.

---

## 3. Struttura cartelle

`[G]` = generato dagli script · `[C]` = curato a mano

```
pentateuco-in-contesto/
├── public/
│   └── data/
│       ├── verses/gen.json … deu.json      [G]
│       ├── words/gen.json … deu.json       [G]
│       ├── crossrefs/gen.json … deu.json   [G]
│       ├── indices/lemmi.json              [G]
│       ├── translations/index.json         [C]  (manifest)
│       ├── translations/luzzi.json         [G]
│       ├── translations/letterale.json     [C]
│       ├── places.json                     [C]  (bootstrap da TIPNR + OpenBible)
│       ├── people.json                     [C]  (bootstrap da TIPNR)
│       ├── events.json                     [C]
│       ├── notes.json                      [C]
│       ├── lexicon_it.json                 [C]
│       └── embeddings.json                 [G]  (derivato dalla curation)
├── bootstrap/                # bozze generate per la revisione umana, fuori da public/
├── scripts/
│   ├── sources/              # TSV/sorgenti scaricati (in .gitignore)
│   ├── import-tahot.ts
│   ├── import-tipnr.ts
│   ├── import-luzzi.ts
│   ├── import-tsk.ts
│   ├── gen-embeddings.ts
│   └── valida.ts
├── src/
│   ├── main.tsx, App.tsx
│   ├── tipi/                 # schemi Zod + tipi TypeScript derivati (unica fonte di verità)
│   ├── dati/                 # loader JSON con cache per libro, hook React
│   ├── lib/                  # morfologia.ts, cosine.ts, ollama.ts
│   ├── stato/                # preferenze (localStorage)
│   ├── viste/                # Lettura, Mappa, Timeline, Genealogie, Assistente
│   └── componenti/
├── index.html, vite.config.ts, package.json, …
```

**`scripts/valida.ts`** (eseguito con `npm run valida` a ogni modifica dei dati) controlla: conformità agli schemi Zod; esistenza di ogni riferimento incrociato (versetti, parole, persone, luoghi, note); reciprocità delle relazioni familiari; copertura contigua delle pericopi sul range curato; coerenza fonti ↔ `da_verificare`; chiavi delle traduzioni tutte risolvibili su id TM.

---

## 4. Decisioni prese rispetto alla bozza della specifica (§6)

Tutte qui, ciascuna col motivo. Nient'altro è stato cambiato.

1. **Sharding per libro** di `verses`, `words`, `crossrefs`. Motivo: `words` per l'intero Pentateuco supererebbe i 25 MB in un solo fetch; per libro si sta su ~5 MB (≈1 MB gzip) con caricamento lazy.
2. **`translations/index.json`** (manifest). Motivo: un hosting statico o il filesystem non possono elencare i file di una cartella; lo "slot pluggable" richiede un manifest.
3. **`indices/lemmi.json`** `[G]`. Motivo: la funzione "tutte le occorrenze del lemma" sarebbe irrealistica senza indice precomputato.
4. **`lexicon_it.json`** `[C]`. Motivo: glosse italiane separate dai file rigenerabili; nell'MVP il pannello parola mostra le glosse inglesi TAHOT etichettate come tali, l'italiano cresce con la curation.
5. **Campi aggiunti a `notes`**: `titolo` (necessario per elenchi e indicatori a margine), `commentatore` e `sefaria_ref` (necessari per il linking Sefaria previsto in §8 della specifica).
6. **Cartella `bootstrap/`** e separazione rigida `[G]`/`[C]`. Motivo: implementa il processo bozza → revisione del §10 rendendo impossibile che una rigenerazione sovrascriva dati approvati.
7. **Embeddings**: si parte in JSON come da specifica; migrazione a binario prevista quando la curation supererà Genesi 1–11.
8. **TypeScript + Zod** (la specifica non fissava TS o JS). Motivo: il rischio principale del progetto sono refusi nei JSON curati; con Zod lo schema è definito una volta sola e fa sia da validatore runtime (`valida.ts`) sia da sorgente dei tipi statici (`z.infer`). Gli script Node sono in TypeScript, eseguiti con `tsx`, così condividono gli schemi di `src/tipi/`.

## 5. Invariato rispetto alla specifica

Scala di confidenza e sua semantica; tre assi temporali mai fusi (tre strutture distinte in `events`); nessun testo biblico né traduzione moderna generati da LLM in nessun componente; prospettive etichettate e mai fuse; ogni claim con fonte o `da_verificare`; stack (SPA React+Vite statica, Leaflet+OSM, D3, Ollama locale con nota `OLLAMA_ORIGINS`); processo di curation con approvazione umana finale.

## 6. Rischi e verifiche rimandate alla fase di import

- **Mapping colonne TAHOT/TIPNR**: da fissare sulla documentazione del repository quando si scrivono gli script. Gli schemi sopra non cambiano: cambia solo il codice di parsing.
- **Edizione esatta della "Luzzi"**: la Riveduta risulta NT 1924 / Bibbia completa 1927 a seconda della fonte digitale (eBible, moduli CrossWire). Verificare edizione e provenienza scrivendo `import-luzzi.ts`; l'anno nel `meta` si fissa allora.
- **Versificazione**: il rimappaggio TVTMS è il punto dove un errore silenzioso costerebbe caro (versetti agganciati al testo sbagliato). Il validatore include un controllo di completezza: ogni versetto TM del Pentateuco deve avere 0 o 1 testo per traduzione completa, mai buchi inattesi.
- **Termini d'uso Sefaria** per l'eventuale caching locale: verifica in Fase 2, quando entrano le note `tradizione_ebraica`.
