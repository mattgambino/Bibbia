import { useVersetti } from './dati/hooks.ts'

// Vista provvisoria del task F0.4: prova del loader, il JSON si mostra in forma
// grezza come da ROADMAP. La vera vista lettura arriva in F1.6, col sistema di design.
function App() {
  const versetti = useVersetti('gen')

  return (
    <main>
      <h1>Pentateuco in contesto</h1>
      <p>
        F0.4 — prova del loader: <code>data/verses/gen.json</code> in forma grezza. I dati sono una
        fixture dichiaratamente finta, sostituita dall'import TAHOT in F1.1.
      </p>
      {versetti.stato === 'in_corso' && <p>Caricamento…</p>}
      {versetti.stato === 'errore' && <p role="alert">Errore di caricamento: {versetti.messaggio}</p>}
      {versetti.stato === 'pronto' && <pre>{JSON.stringify(versetti.dati, null, 2)}</pre>}
    </main>
  )
}

export default App
