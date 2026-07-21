// src/componenti/Minimappa.tsx — minimappa dei luoghi della pericope (F2.2).
//
// La mappa è un supplemento, non la fonte: tutto ciò che mostra è ripetuto
// nell'elenco testuale accanto, perché un luogo `symbolic` o senza candidati non
// ha coordinate e sulla mappa semplicemente non esiste. Il marker riflette lo
// status critico del LUOGO (non il punteggio OpenBible del singolo candidato):
// colore più stile di tratto, la stessa grammatica dei token (DESIGN.md §4).

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Luogo } from '../tipi/index.ts'

type Props = { luoghi: Luogo[] }

export function Minimappa({ luoghi }: Props) {
  const contenitore = useRef<HTMLDivElement | null>(null)
  const mappa = useRef<L.Map | null>(null)
  const marker = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const elemento = contenitore.current
    if (!elemento || mappa.current) return

    const motoRidotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const m = L.map(elemento, {
      // Dentro una colonna che scorre, la rotella deve scorrere la pagina.
      scrollWheelZoom: false,
      zoomAnimation: !motoRidotto,
      fadeAnimation: !motoRidotto,
      markerZoomAnimation: !motoRidotto,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    marker.current = L.layerGroup().addTo(m)
    mappa.current = m

    return () => {
      m.remove()
      mappa.current = null
      marker.current = null
    }
  }, [])

  useEffect(() => {
    const m = mappa.current
    const gruppo = marker.current
    if (!m || !gruppo) return

    gruppo.clearLayers()
    const punti: L.LatLngExpression[] = []

    for (const luogo of luoghi) {
      for (const candidato of luogo.candidati) {
        punti.push([candidato.lat, candidato.lon])
        const nome = luogo.nomi.it || luogo.nomi.translit || luogo.id
        L.marker([candidato.lat, candidato.lon], {
          // Il marker è un div vuoto: forma e colore stanno nel CSS dei token.
          icon: L.divIcon({
            className: `marker-luogo marker-luogo--${luogo.status}`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          title: `${nome} — ${candidato.etichetta}`,
          alt: `${nome}, ipotesi: ${candidato.etichetta}`,
        }).addTo(gruppo)
      }
    }

    // Senza punti la mappa resterebbe su una vista arbitraria: il chiamante non
    // la monta affatto in quel caso, ma la guardia evita un fitBounds vuoto.
    if (punti.length === 0) return
    m.fitBounds(L.latLngBounds(punti).pad(0.35), { maxZoom: 9, animate: false })
    // Il contenitore nasce nascosto quando il tab non è quello attivo: Leaflet
    // deve rimisurarsi quando torna visibile.
    m.invalidateSize({ animate: false })
  }, [luoghi])

  return <div className="minimappa" ref={contenitore} aria-label="Minimappa dei luoghi della pericope" />
}
