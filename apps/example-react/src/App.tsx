import { useStoredState } from '@nicolopadovan/persistent-state/react'
import { draft, profile } from './state'

export function App() {
  const [{ name, visits }, setProfile, { reset, isPersistent }] = useStoredState(profile)
  const [text, setText] = useStoredState(draft)
  return (
    <main>
      <h1>persistent-state</h1>
      <p>
        isPersistent: <output id="persistent">{String(isPersistent)}</output>
      </p>
      <label>
        Name (localStorage, version 2){' '}
        <input value={name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
      </label>
      <p>
        Visits: <output id="visits">{visits}</output>{' '}
        <button onClick={() => setProfile((p) => ({ ...p, visits: p.visits + 1 }))}>Add visit</button>
      </p>
      <label>
        Draft (sessionStorage) <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p>
        <button
          onClick={() => {
            reset()
            draft.reset()
          }}
        >
          Reset
        </button>
      </p>
    </main>
  )
}
