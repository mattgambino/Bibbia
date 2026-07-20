# Fixture di prova per `scripts/valida.ts` (task F0.3)

Mini-dataset **interamente finti** per esercitare il validatore. Nessun file qui dentro
contiene testo biblico o di traduzioni reali: ogni stringa di "testo" è un segnaposto
dichiaratamente finto (`PAROLA-FINTA-…`, "Testo segnaposto dichiaratamente finto…"),
e ogni dato di curation (coordinate, età, anni, fonti) è inventato **a scopo di test
del validatore**, mai da copiare in `bootstrap/` o `public/data/`.

Uso:

```
npx tsx scripts/valida.ts scripts/fixtures/valido   # atteso: OK, exit 0
npx tsx scripts/valida.ts scripts/fixtures/rotto    # atteso: 18 errori, exit 1
```

## `valido/`

Copre ogni schema di SCHEMI-DATI §2: 4 versetti finti di "gen" (2 capitoli), 5 parole,
crossref (interno, esterno, esterno con codice a cifra iniziale `1sa`), indice lemmi,
manifest + traduzione finta completa, 1 luogo (candidato con e senza `peso_openbible`),
3 persone con relazioni reciproche, 2 eventi che coprono `gen.1.1`–`gen.2.1` senza buchi
(inclusa la successione tra capitoli), 5 note (una per ogni tipo di target), lexicon,
embeddings (dim 3).

## `rotto/`

Stesso impianto con **18 rotture intenzionali**, una per controllo:

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
