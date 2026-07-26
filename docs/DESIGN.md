# DESIGN — direzione visiva e vincoli UI

Vincolante per ogni task che tocca la UI. **In caso di conflitto tra questo documento e le indicazioni generiche delle skill di design (`frontend-design`, `ui-ux-pro-max`), prevale questo documento.** Le skill servono a eseguire bene dentro questi binari, non a scegliere la direzione.

## 1. Carattere dell'app

Strumento di lettura e studio, non una landing page né una dashboard. Riferimento di tono: l'apparato critico di un'edizione a stampa seria, portato a schermo — sobrietà, gerarchia netta, nessuna decorazione che non porti informazione. Il protagonista visivo è il testo ebraico; tutto il resto (note, badge, pannelli) è apparato e deve comportarsi da apparato.

Esplicitamente **fuori direzione**, anche se le skill li propongono: gradienti decorativi, glassmorphism, ombre teatrali, hero section, animazioni non funzionali, densità urlata (tutto bold, tutto colorato). Transizioni solo dove aiutano l'orientamento (sincronizzazione della colonna contesto, apertura pannelli), brevi e discrete.

## 2. Tipografia ebraica (il vincolo più duro)

- Font con copertura **completa** di niqqud (vocali) e te'amim (accenti di cantillazione). Proposta di default: **Ezra SIL** (o la variante SR), licenza SIL OFL, progettato per il testo masoretico con cantillazione. Alternative con supporto te'amim se la resa a schermo delude: Taamey David CLM / Taamey Frank CLM (verificarne la licenza prima di includerle). SBL Hebrew ha resa eccellente ma licenza da verificare per il self-hosting: non è il default.
- La scelta si chiude solo dopo **verifica visiva** su versetti reali con segni densi (più te'amim e niqqud sulla stessa parola), a più corpi.
- Font **self-hosted** in `public/fonts/` con `@font-face`: l'app deve funzionare offline, niente CDN. L'unica eccezione al funzionamento offline è la **carta di sfondo della mappa** (tile OpenStreetMap, imposti da SPECIFICA §5): senza rete i marker e i loro dati restano, manca solo lo sfondo. Nessun'altra superficie può dipendere dalla rete.
- Ebraico sempre in `dir="rtl"`; quando compare inline dentro testo italiano (pannello parola, note), isolarlo (`<bdi>` o `unicode-bidi: isolate`) per evitare rotture bidirezionali.
- Corpo dell'ebraico ~125–140% del corpo latino affiancato, interlinea generosa: i segni stanno sopra e sotto la riga e non devono collidere né tagliarsi.
- Niente `letter-spacing` sull'ebraico; nessuna sillabazione o spezzatura delle parole.

## 3. Tipografia latina e UI

- Traduzione a fronte: un serif ad alta leggibilità. UI, etichette, badge: un sans discreto.
- La scelta specifica viene proposta dalle skill in F1.6 **entro questi vincoli**: licenza libera (OFL o equivalente), self-hosted, ottima resa a 14–18px, corsivo vero, e copertura dei diacritici delle traslitterazioni (ʾ ʿ ā ē î ḏ ṯ š ecc.) — da verificare esplicitamente.
- Misura di lettura della colonna centrale: ~60–75 caratteri per riga per la traduzione.

## 4. Semantica visiva della confidenza (trasversale a tutta l'app)

- I 5 status (`consensus`, `majority`, `disputed`, `speculative`, `symbolic`) hanno ciascuno **colore + forma/pattern** distinti — mai solo colore (accessibilità, daltonismo). La specifica fissa già la grammatica per la mappa: marker pieno = identificato, tratteggiato = conteso, segnaposto dedicato = simbolico; la stessa grammatica si estende a badge delle note e alla timeline (range e sfumature, mai punti secchi).
- `attribuito` (note della tradizione ebraica) non è un sesto grado della scala e non deve sembrarlo: prende il colore della prospettiva tradizionale (`--prospettiva-tradizione`), così badge della nota e bordo della prospettiva dicono la stessa cosa, e l'unico segno tondo (○) fra cinque segni quadrangolari. Non compare mai sui marker della mappa.
- `da_verificare`: trattamento visivo dedicato e volutamente "non finito" (es. bordo tratteggiato), mai nascosto o attenuato.
- Le due prospettive (storico-critica vs `tradizione_ebraica`) distinguibili a colpo d'occhio nelle note (etichetta + tratto visivo), senza gerarchizzarle.
- Tutti questi valori vivono come **design token** (CSS custom properties) in un unico file (`src/stili/tokens.css`), definiti una volta in F1.6 e riusati ovunque: badge, indicatori a margine, marker mappa, timeline. Vietati valori esadecimali sparsi nei componenti.

## 5. Layout

- Tre colonne desktop-first come da specifica §8: sinistra stretta (navigazione), centro (lettura, larghezza controllata), destra (contesto). Le laterali non competono visivamente col centro.
- Sotto ~1100px la colonna destra diventa collassabile. Il mobile **non** è un obiettivo dell'MVP: nessun lavoro responsive oltre questo.
- Palette: base carta/inchiostro (chiara), accenti solo semantici (status, prospettive, link). Dark mode: fuori scope MVP.

## 6. Processo per i task UI

1. Ogni task che tocca la UI usa le skill `frontend-design` e `ui-ux-pro-max` (regola in CLAUDE.md).
2. Al primo task UI (F1.6, passo *a*): **prima** la proposta di sistema — design token completi, scelta della font latina motivata, self-hosting del font ebraico, mock statico (HTML/CSS) della vista lettura — poi, **solo dopo approvazione**, l'implementazione React (passo *b*).
3. I mock e le demo usano **esclusivamente** versetti già importati dal database, oppure placeholder dichiaratamente finti ("Lorem…"): mai testo biblico o traduzioni scritti a mano (la regola 1 di CLAUDE.md vale anche per i mockup).
4. Le viste successive (mappa, timeline, genealogie, assistente) riusano i token; non si reinventano stili per vista.
5. Accessibilità minima non negoziabile: contrasto AA, focus visibile, navigazione da tastiera di testo e pannelli, `aria-label` sui controlli a sola icona.
