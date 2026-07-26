// test/valida-fixture.test.ts — rende automatico il giro sulle fixture del validatore.
//
// `scripts/fixtures/` esisteva già e copre bene il validatore, ma andava lanciato a mano
// (fixtures/README.md): un controllo che nessuno esegue non è un guardrail. Qui il
// validatore viene invocato come sottoprocesso — lo stesso comando documentato — e se ne
// verificano exit code e conteggi. Il numero di rotture è volutamente hardcodato: se
// cambia, o è stata aggiunta una rottura (e va aggiornata la tabella del README delle
// fixture) o un controllo ha smesso di scattare.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const radice = fileURLToPath(new URL('..', import.meta.url))

/** Numero di rotture intenzionali in `scripts/fixtures/rotto/` (v. il suo README). */
const ROTTURE_ATTESE = 20

function valida(dir: string) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/valida.ts', dir], {
    cwd: radice,
    encoding: 'utf8',
  })
  assert.equal(r.error, undefined, `il validatore non è partito: ${r.error?.message}`)
  return { codice: r.status, uscita: `${r.stdout}${r.stderr}` }
}

test('la fixture valida passa: exit 0, nessun errore', () => {
  const { codice, uscita } = valida('scripts/fixtures/valido')
  assert.equal(codice, 0, uscita)
  assert.match(uscita, /OK — nessun errore/)
})

test('la fixture valida produce il solo avviso non bloccante atteso', () => {
  const { uscita } = valida('scripts/fixtures/valido')
  assert.match(uscita, /AVVISI \(1\) — non bloccanti/)
})

test('la fixture rotta fallisce con tutte le rotture attese', () => {
  const { codice, uscita } = valida('scripts/fixtures/rotto')
  assert.equal(codice, 1, uscita)
  assert.match(uscita, new RegExp(`ERRORI: ${ROTTURE_ATTESE} in `), uscita)
})

test('il dataset reale resta valido', () => {
  const { codice, uscita } = valida('public/data')
  assert.equal(codice, 0, uscita)
  assert.match(uscita, /OK — nessun errore/)
})
