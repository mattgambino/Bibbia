import { useState } from 'react'
import { Assistente } from './viste/Assistente.tsx'
import { Lettura } from './viste/Lettura.tsx'
import { Mappa } from './viste/Mappa.tsx'
import { Timeline } from './viste/Timeline.tsx'
import { Genealogie } from './viste/Genealogie.tsx'

/**
 * Le viste a schermo pieno (mappa da F3.1, timeline da F3.2, genealogie da F3.3)
 * si raggiungono dai pannelli di contesto e tornano alla lettura. Lo scambio è
 * uno stato, non un router: l'app non ha URL da condividere e ogni dipendenza in
 * più va chiesta prima (CLAUDE.md, regola 5). La posizione di lettura sopravvive
 * al passaggio perché sta in localStorage.
 */
type Vista =
  | { nome: 'lettura'; versetto?: string }
  | { nome: 'mappa'; luogo?: string }
  | { nome: 'timeline'; pericope?: string }
  | { nome: 'genealogie'; persona?: string }
  | { nome: 'assistente' }

function App() {
  const [vista, setVista] = useState<Vista>({ nome: 'lettura' })

  if (vista.nome === 'mappa') {
    return (
      <Mappa
        luogoIniziale={vista.luogo ?? null}
        onLettura={() => setVista({ nome: 'lettura' })}
        onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
      />
    )
  }
  if (vista.nome === 'timeline') {
    return (
      <Timeline
        pericopeIniziale={vista.pericope ?? null}
        onLettura={() => setVista({ nome: 'lettura' })}
        onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
      />
    )
  }
  if (vista.nome === 'genealogie') {
    return (
      <Genealogie
        personaIniziale={vista.persona ?? null}
        onLettura={() => setVista({ nome: 'lettura' })}
        onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
      />
    )
  }
  if (vista.nome === 'assistente') {
    return (
      <Assistente
        onLettura={() => setVista({ nome: 'lettura' })}
        onVersetto={(versetto) => setVista({ nome: 'lettura', versetto })}
      />
    )
  }
  return (
    <Lettura
      versettoIniziale={vista.versetto ?? null}
      onMappa={(luogo) => setVista({ nome: 'mappa', luogo })}
      onTimeline={(pericope) => setVista({ nome: 'timeline', pericope })}
      onGenealogia={(persona) => setVista({ nome: 'genealogie', persona })}
      onAssistente={() => setVista({ nome: 'assistente' })}
    />
  )
}

export default App
