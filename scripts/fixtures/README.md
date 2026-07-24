# Fixture di prova per `scripts/valida.ts` (task F0.3)

Mini-dataset **interamente finti** per esercitare il validatore. Nessun file qui dentro
contiene testo biblico o di traduzioni reali: ogni stringa di "testo" è un segnaposto
dichiaratamente finto (`PAROLA-FINTA-…`, "Testo segnaposto dichiaratamente finto…"),
e ogni dato di curation (coordinate, età, anni, fonti) è inventato **a scopo di test
del validatore**, mai da copiare in `bootstrap/` o `public/data/`.

Uso:

```
npx tsx scripts/valida.ts scripts/fixtures/valido   # atteso: 1 avviso non bloccante, 0 errori
npx tsx scripts/valida.ts scripts/fixtures/rotto    # atteso: 20 errori, exit 1
```

> **Scarto noto, non intenzionale (rilevato il 24/07/2026, T1).** Entrambe le fixture
> hanno `nota-finta-02` di tipo `tradizione_ebraica` con `confidence: "consensus"`, che
> il controllo di `valida.ts` (`confidence "attribuito"` obbligatorio su quel tipo)
> rifiuta. La regola è stata aggiunta dopo la scrittura delle fixture e queste non sono
> mai state aggiornate: `valido/` esce quindi **1** ed elenca quell'errore, e `rotto/`
> ne conta **21** invece dei 20 documentati qui sotto. Non è una rottura di questa
> tabella: va deciso a parte se correggere le fixture (`"attribuito"`) o documentare la
> 21ª riga. Fino ad allora i numeri attesi qui sopra sono quelli *voluti*, non quelli
> osservati.

## `valido/`

Copre ogni schema di SCHEMI-DATI §2: 4 versetti finti di "gen" (2 capitoli), 5 parole,
crossref (interno, esterno, esterno con codice a cifra iniziale `1sa`), indice lemmi,
manifest + traduzione finta completa, 1 luogo (candidato con e senza `peso_openbible`),
3 persone con relazioni reciproche, 2 eventi che coprono `gen.1.1`–`gen.2.1` senza buchi
(inclusa la successione tra capitoli), 5 note (una per ogni tipo di target), lexicon,
embeddings (dim 3).

Sull'asse composizione `valido/` esercita anche i casi che **non** devono produrre errori:
una `posizioni[].datazione` valorizzata e contenuta nel range, una `datazione: null`, e una
`nota_di_metodo` valorizzata con fonti (caso di controllo: la nota è ammessa e le sue fonti
non contano nel controllo `fonti ↔ da_verificare`). `evento-finto-2` produce inoltre l'unico
**avviso non bloccante** della fixture: range `−550/−450` più largo dell'inviluppo `−550/−500`
della sola posizione datata.

## `rotto/`

Stesso impianto con **20 rotture intenzionali**, una per controllo:

| # | file | rottura attesa |
|---|------|----------------|
| 1 | `words/gen.json` | `gen.1.3.01` con `pos: 9` incoerente con l'id |
| 2 | `crossrefs/gen.json` | `interno: true` con destinazione `psa.1.1` (fuori Pentateuco) |
| 3 | `indices/lemmi.json` | occorrenza `gen.1.1.99` inesistente |
| 4 | `translations/index.json` | traduzione "fantasma" dichiarata senza file |
| 5 | `translations/finta.json` | chiave `gen.5.5` non risolvibile su id TM |
| 6 | `translations/finta.json` | dichiarata `completa` ma manca `gen.1.3` |
| 7 | `places.json` | `luogo-finto-rotto` con `status: "certissimo"` (enum non valido) |
| 8 | `people.json` | id `persona-finta-b` duplicato nel file |
| 9 | `people.json` | `persona-finta-a` ha `persona-finta-b` tra i figli, ma b ha `padre: null` |
| 10 | `people.json` | `persona-finta-c` riferisce `gen.9.9` inesistente |
| 11 | `events.json` | buco di copertura: manca `gen.1.2` tra i due eventi |
| 12 | `events.json` | `composizione.range` con `da > a` (−450 > −550) |
| 13 | `notes.json` | `commentatore` valorizzato su nota `storica` |
| 14 | `notes.json` | pericope invertita (`gen.1.2` → `gen.1.1`) |
| 15 | `notes.json` | `nota-finta-04` senza fonti ma `da_verificare: false` |
| 16 | `lexicon_it.json` | `H9999` senza fonti ma `da_verificare: false` |
| 17 | `embeddings.json` | riferimento a `nota-inesistente` |
| 18 | `embeddings.json` | vettore di dimensione 2 con `meta.dim: 3` |
| 19 | `events.json` | `posizioni[0].datazione` (−700/−450) non contenuta in `composizione.range` (−600/−500) |
| 20 | `events.json` | `evento-finto-2` con fonti **solo** in `nota_di_metodo` e `da_verificare: false`: la nota non deve soddisfare il controllo al posto di una posizione |
