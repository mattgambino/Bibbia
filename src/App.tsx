import { Suspense, lazy, useState } from 'react'
import { Lettura } from './viste/Lettura.tsx'
import { Ricerca } from './viste/Ricerca.tsx'

/**
 * Le viste a schermo pieno (mappa da F3.1, timeline da F3.2, genealogie da F3.3)
 * si raggiungono dai pannelli di contesto e tornano alla lettura. Lo scambio è
 * uno stato, non un router: l'app non ha URL da condividere e ogni dipendenza in
 * più va chiesta prima (CLAUDE.md, regola 5). La posizione di lettura sopravvive
 * al passaggio perché sta in localStorage.
 *
 * Le tre viste che portano una libreria di disegno (Leaflet per la mappa, D3 per
 * timeline e genealogie) e l'assistente si caricano con `import()` dinamico: chi
 * apre solo la lettura non ne scarica il codice. Il fallback usa la stessa
 * dicitura di attesa del resto dell'app — è un caricamento, non un evento.
 */
const Mappa = lazy(() => import('./viste/Mappa.tsx').then((m) => ({ default: m.Mappa })))
const Timeline = lazy(() => import('./viste/Timeline.tsx').then((m) => ({ default: m.Timeline })))
const Genealogie = lazy(() => import('./viste/Genealogie.tsx').then((m) => ({ default: m.Genealogie })))
const Assistente = lazy(() => import('./viste/Assistente.tsx').then((m) => ({ default: m.Assistente })))

type Vista =
  | { nome: 'lettura'; versetto?: string; parola?: string }
  | { nome: 'mappa'; luogo?: string }
  | { nome: 'timeline'; pericope?: string }
  | { nome: 'genealogie'; persona?: string }
  | { nome: 'ricerca'; query?: string }
  | { nome: 'assistente' }

function Attesa({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="stato-caricamento">Caricamento della vista…</p>}>{children}</Suspense>
}

function App() {
  const [vista, setVista] = useState<Vista>({ nome: 'lettura' })

  if (vista.nome === 'mappa') {
    return (
      <Attesa>
        <Mappa
          luogoIniziale={vista.luogo ?? null}
          onLettura={() => setVista({ nome: 'lettura' })}
          onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
        />
      </Attesa>
    )
  }
  if (vista.nome === 'timeline') {
    return (
      <Attesa>
        <Timeline
          pericopeIniziale={vista.pericope ?? null}
          onLettura={() => setVista({ nome: 'lettura' })}
          onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
        />
      </Attesa>
    )
  }
  if (vista.nome === 'genealogie') {
    return (
      <Attesa>
        <Genealogie
          personaIniziale={vista.persona ?? null}
          onLettura={() => setVista({ nome: 'lettura' })}
          onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
        />
      </Attesa>
    )
  }
  if (vista.nome === 'ricerca') {
    return (
      <Ricerca
        queryIniziale={vista.query ?? ''}
        onLettura={() => setVista({ nome: 'lettura' })}
        onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
        onLemma={(parola) => setVista({ nome: 'lettura', parola })}
      />
    )
  }
  if (vista.nome === 'assistente') {
    return (
      <Attesa>
        <Assistente
          onLettura={() => setVista({ nome: 'lettura' })}
          onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
        />
      </Attesa>
    )
  }
  return (
    <Lettura
      versettoIniziale={vista.versetto ?? null}
      parolaIniziale={vista.parola ?? null}
      onMappa={(luogo) => setVista({ nome: 'mappa', luogo })}
      onTimeline={(pericope) => setVista({ nome: 'timeline', pericope })}
      onGenealogia={(persona) => setVista({ nome: 'genealogie', persona })}
      onRicerca={(query) => setVista({ nome: 'ricerca', query })}
      onAssistente={() => setVista({ nome: 'assistente' })}
    />
  )
}

export default App
