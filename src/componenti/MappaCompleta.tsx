// src/componenti/MappaCompleta.tsx — la carta della vista mappa (F3.1).
//
// Differenza sostanziale dalla minimappa di F2.2: lì un marker era un punto e
// basta, qui ogni marker è **un'ipotesi** su un luogo, e più marker possono
// appartenere allo stesso luogo. Perché questo si veda invece di doverlo
// dedurre, quando un luogo è scelto le sue ipotesi vengono legate da raggi
// sottili al loro baricentro: non è una rotta né un percorso, è il segno che
// quei punti sono candidati concorrenti per una cosa sola.
//
// Il popup è uno solo, staccato dai marker: il suo contenuto è React (portale
// su un div stabile), così badge, fonti e segni di confidenza restano quelli di
// Elementi.tsx invece di essere riscritti come stringhe HTML.

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { collocabile, nomeLuogo } from '../lib/luoghi.ts'
import type { LuogoCurato } from '../lib/luoghi.ts'

/**
 * Quale ipotesi di quale luogo è aperta: il popup sta sempre su un candidato.
 * `inquadra` chiede alla carta di portare in vista tutte le ipotesi di quel
 * luogo: lo usa l'elenco, che manda su un luogo di cui non si sa dove cada;
 * un click su un marker no, quel luogo lo si sta già guardando.
 */
export type Selezione = { luogo: string; candidato: string; inquadra?: boolean }

type Props = {
  /** Già filtrati dalla vista; quelli non collocabili vengono ignorati qui. */
  luoghi: LuogoCurato[]
  selezione: Selezione | null
  onSeleziona: (s: Selezione | null) => void
  /** Contenuto del popup: renderizzato dal chiamante, montato qui via portale. */
  children?: React.ReactNode
}

const MOTO_RIDOTTO = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function MappaCompleta({ luoghi, selezione, onSeleziona, children }: Props) {
  const contenitore = useRef<HTMLDivElement | null>(null)
  const mappa = useRef<L.Map | null>(null)
  const strato = useRef<L.LayerGroup | null>(null)
  const popup = useRef<L.Popup | null>(null)
  // Il div del popup vive fuori dal ciclo di render di React: Leaflet lo sposta
  // dentro il proprio contenitore, React ci scrive dentro con un portale.
  const contenutoPopup = useMemo(() => document.createElement('div'), [])
  // La chiusura del popup può venire dall'utente (X, Esc, click sulla carta) o
  // da noi: solo la prima deve tornare indietro come deselezione.
  const chiusuraNostra = useRef(false)
  // I gestori Leaflet vivono più a lungo di un render: leggono la callback da un
  // ref, così non serve né ricostruire la mappa né chiedere al chiamante di
  // memoizzare la prop.
  const seleziona = useRef(onSeleziona)
  seleziona.current = onSeleziona
  // Ultimo luogo inquadrato: cambiando ipotesi dentro lo stesso luogo la vista
  // non si rifà da capo, altrimenti a ogni scelta la carta scatterebbe.
  const inquadrato = useRef<string | null>(null)

  const collocabili = useMemo(() => luoghi.filter((c) => collocabile(c.luogo)), [luoghi])
  // Rifare il fitBounds a ogni selezione toglierebbe al lettore la vista che si
  // è costruito: si riquadra solo quando cambia l'insieme mostrato.
  const chiaveInsieme = collocabili.map((c) => c.luogo.id).join('|')

  useEffect(() => {
    const elemento = contenitore.current
    if (!elemento || mappa.current) return

    const animazioni = !MOTO_RIDOTTO()
    const m = L.map(elemento, {
      scrollWheelZoom: true,
      zoomAnimation: animazioni,
      fadeAnimation: animazioni,
      markerZoomAnimation: animazioni,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    strato.current = L.layerGroup().addTo(m)
    popup.current = L.popup({
      className: 'popup-luogo',
      maxWidth: 320,
      minWidth: 260,
      autoPanPadding: [24, 24],
      // Un click sulla carta non chiude il popup. Due ragioni, una di sostanza e
      // una tecnica. Di sostanza: il popup è apparato, si sta leggendo — chiuderlo
      // perché il dito ha toccato il mare è una perdita, non un comodo; restano la
      // X e Esc. Tecnica: scegliendo un'altra ipotesi React rifà la riga cliccata,
      // il bersaglio del click sparisce dal documento e Leaflet, che risale la
      // catena dei genitori per capire se il click veniva dal popup, non la trova
      // più — trattava quel click come un click sulla carta e chiudeva tutto.
      closeOnClick: false,
    }).setContent(contenutoPopup)
    m.on('popupclose', () => {
      if (chiusuraNostra.current) return
      seleziona.current(null)
    })
    mappa.current = m

    return () => {
      m.remove()
      mappa.current = null
      strato.current = null
      popup.current = null
    }
  }, [contenutoPopup])

  // Marker e raggi: si ridisegnano anche al cambio di selezione (poche decine di
  // elementi), così lo stato "scelto" sta nella classe del marker e non in un
  // secondo canale da tenere sincronizzato.
  useEffect(() => {
    const m = mappa.current
    const gruppo = strato.current
    if (!m || !gruppo) return
    gruppo.clearLayers()

    for (const { luogo } of collocabili) {
      const scelto = selezione?.luogo === luogo.id
      const nome = nomeLuogo(luogo)

      if (scelto && luogo.candidati.length > 1) {
        const centro: [number, number] = [
          luogo.candidati.reduce((s, c) => s + c.lat, 0) / luogo.candidati.length,
          luogo.candidati.reduce((s, c) => s + c.lon, 0) / luogo.candidati.length,
        ]
        for (const c of luogo.candidati) {
          L.polyline([centro, [c.lat, c.lon]], {
            // Il raggio prende il colore dello status del luogo: il legame e i
            // punti che lega dicono la stessa cosa, con lo stesso colore.
            className: `raggio-ipotesi raggio-ipotesi--${luogo.status}`,
            interactive: false,
          }).addTo(gruppo)
        }
      }

      for (const candidato of luogo.candidati) {
        const attivo = scelto && selezione?.candidato === candidato.id
        const classi = [
          'marker-luogo',
          `marker-luogo--${luogo.status}`,
          scelto ? 'marker-luogo--scelto' : '',
          attivo ? 'marker-luogo--attivo' : '',
          selezione && !scelto ? 'marker-luogo--sfondo' : '',
        ]
          .filter(Boolean)
          .join(' ')
        L.marker([candidato.lat, candidato.lon], {
          icon: L.divIcon({ className: classi, iconSize: [14, 14], iconAnchor: [7, 7] }),
          title: `${nome} — ${candidato.etichetta}`,
          alt: `${nome}, ipotesi: ${candidato.etichetta}`,
          riseOnHover: true,
        })
          .on('click', () => seleziona.current({ luogo: luogo.id, candidato: candidato.id }))
          .addTo(gruppo)
      }
    }
  }, [collocabili, selezione])

  useEffect(() => {
    const m = mappa.current
    if (!m) return
    const punti = collocabili.flatMap((c) =>
      c.luogo.candidati.map((k) => [k.lat, k.lon] as L.LatLngExpression),
    )
    m.invalidateSize({ animate: false })
    // Nessun punto da mostrare: si lascia la vista com'era invece di saltare su
    // un riquadro arbitrario. Il pannello accanto dice perché la carta è vuota.
    if (punti.length === 0) return
    m.fitBounds(L.latLngBounds(punti).pad(0.25), { maxZoom: 8, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveInsieme])

  // Apertura e chiusura del popup seguono la selezione, da qualunque parte venga
  // (marker o elenco): un solo stato, due modi di toccarlo.
  useEffect(() => {
    const m = mappa.current
    const p = popup.current
    if (!m || !p) return

    if (!selezione) {
      chiusuraNostra.current = true
      m.closePopup(p)
      chiusuraNostra.current = false
      inquadrato.current = null
      return
    }
    const luogo = collocabili.find((c) => c.luogo.id === selezione.luogo)?.luogo
    const candidato = luogo?.candidati.find((c) => c.id === selezione.candidato)
    if (!candidato) {
      // Il luogo scelto è uscito dai filtri o non è collocabile: niente popup.
      chiusuraNostra.current = true
      m.closePopup(p)
      chiusuraNostra.current = false
      return
    }
    // Prima si inquadra il luogo, poi si apre il popup: aprendolo per primo,
    // l'autoPan sposterebbe una vista che stiamo per rifare comunque.
    if (selezione.inquadra && luogo && luogo.id !== inquadrato.current) {
      const punti = luogo.candidati.map((c) => [c.lat, c.lon] as L.LatLngExpression)
      m.fitBounds(L.latLngBounds(punti).pad(0.6), { maxZoom: 7, animate: false })
    }
    inquadrato.current = selezione.luogo

    p.setLatLng([candidato.lat, candidato.lon])
    if (!p.isOpen()) {
      p.openOn(m)
      // Solo ora il contenuto è dentro il documento: il fuoco può entrarci, e
      // chi naviga da tastiera si ritrova dove ha appena chiesto di andare.
      contenutoPopup.querySelector<HTMLElement>('[data-fuoco]')?.focus({ preventScroll: true })
    } else p.update()
  }, [selezione, collocabili])

  return (
    <>
      <div className="mappa-carta" ref={contenitore} aria-label="Carta dei luoghi curati" />
      {createPortal(children, contenutoPopup)}
    </>
  )
}
