# AVVIO — come usare questo pacchetto con Claude Code

*(Questo file è per te, non per Claude Code: puoi tenerlo nel repo o cancellarlo.)*

## Contenuto

```
CLAUDE.md            → contratto operativo: Claude Code lo carica automaticamente a ogni sessione
docs/SPECIFICA.md    → la tua specifica, vincolante
docs/SCHEMI-DATI.md  → schemi dati v1 (prevalgono sul §6 della specifica)
docs/DESIGN.md       → direzione visiva e vincoli UI (prevale sulle skill di design)
docs/ROADMAP.md      → i task, uno per sessione, con checkbox di avanzamento
```

## Prerequisiti sulla macchina

- **Node.js LTS** — per il progetto (Vite, npm, script di import).
- **Git for Windows** — per il repo, e su Windows nativo dà a Claude Code lo strumento Bash.
- **Python 3** — richiesto dagli script interni della skill `ui-ux-pro-max`.
- **Claude Code** installato e autenticato (piano che lo includa, o crediti API).

## Setup (una volta sola)

1. Crea la cartella del progetto (es. `pentateuco-in-contesto/`) e copia dentro `CLAUDE.md` e `docs/` così come sono. `CLAUDE.md` deve stare nella **radice** del progetto.
2. `git init` subito: il valore del progetto è il dataset curato, e il version control è il tuo backup e la tua rete di sicurezza sulle revisioni.
3. **Installa le due skill di design.**
   - `frontend-design` (ufficiale Anthropic) — dentro Claude Code:
     `/plugin install frontend-design@claude-plugins-official`
     (il marketplace ufficiale è già registrato; in alternativa sfoglia con `/plugin`).
   - `ui-ux-pro-max` (community, repo `nextlevelbuilder/ui-ux-pro-max-skill`) — dal terminale, nella radice del progetto:
     `npx ui-ux-pro-max-cli init --ai claude`
     Si installa in `.claude/skills/ui-ux-pro-max` dentro il progetto: **committala nel repo**, così resta versionata. In alternativa via marketplace: `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` poi `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`.
   - Avvertenza: `ui-ux-pro-max` è una skill di terze parti — istruzioni e script altrui che entrano nel tuo agente. È il progetto community più diffuso della categoria, ma dagli un'occhiata prima di fidarti ciecamente.
4. Apri Claude Code **nella cartella del progetto** (terminale: `claude` dalla radice; oppure la tab Code dell'app desktop puntata sulla cartella).

## Primo messaggio (F0.1)

> Leggi per intero docs/SPECIFICA.md, docs/SCHEMI-DATI.md, docs/DESIGN.md e docs/ROADMAP.md. Poi esegui **solo il task F0.1**. A fine task fermati, riepiloga cosa hai fatto e quali scelte hai preso.

Per le sessioni successive:

> Leggi docs/ROADMAP.md e i documenti pertinenti, poi esegui il task <ID>. Fermati a fine task.

## Prompt del primo task UI (F1.6 — quando ci arrivi)

> Esegui il task F1.6, **solo il passo (a)**: usa le skill frontend-design e ui-ux-pro-max, applicando i vincoli di docs/DESIGN.md, che prevale in caso di conflitto. Consegna: design token completi, scelta motivata della font latina, self-hosting del font ebraico con verifica su versetti reali importati, mock statico della vista lettura. Fermati lì e aspetta la mia approvazione prima di implementare il passo (b).

Nota: le due skill contano davvero da F1.6 in poi (è lì che nasce la UI). Nei task precedenti non c'è interfaccia e non serve invocarle: la regola in `CLAUDE.md` le rende comunque obbligatorie su ogni task che tocca la UI, quindi non dipende dalla tua memoria.

## Consigli operativi

- **Un task per sessione, sessione nuova per task nuovo.** Ogni sessione riparte con contesto pulito ma ricarica `CLAUDE.md` automaticamente; la ROADMAP con le checkbox aggiornate fa da memoria di avanzamento. Meglio questo che una sessione infinita che si degrada.
- **I task ⏸ si fermano prima dell'irreversibile.** Quelli di curation producono bozze in `bootstrap/` che revisioni tu; F1.6(a) si ferma alla proposta di design. Se Claude Code salta un cancello, fermalo e faglielo notare.
- **`npm run valida` è il tuo cane da guardia.** Pretendilo verde alla chiusura di ogni task che tocca dati o schemi.
- **CLAUDE.md è contesto, non un vincolo tecnico.** Claude Code lo segue bene ma non è un firewall: le regole davvero critiche (mai testo biblico a memoria, mai dati inventati) restano da verificare a campione nelle revisioni, soprattutto in Fase 2-3. Diffida in particolare di note con fonti molto precise ma non verificabili: controllane qualcuna.
- **Occhio all'estetica di default delle skill di design:** tendono a landing page vistose (gradienti, glassmorphism, animazioni). `docs/DESIGN.md` esiste apposta e prevale; se il risultato scivola in quella direzione, richiamalo al documento.
- **Se aggiorni le regole**, modifica `CLAUDE.md` o i file in `docs/` direttamente (o chiedi a Claude Code di farlo): dalla sessione successiva valgono le nuove.
- Tieni `CLAUDE.md` snello: se col tempo ci accumuli troppe cose, spostale nei documenti in `docs/` e lascia nel file solo le regole operative.
