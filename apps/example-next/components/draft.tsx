'use client'

import { useStoredState } from '@nicolopadovan/persistent-state/react'
import { draft } from '../lib/state'

export function Draft() {
  const [text, setText] = useStoredState(draft)
  return (
    <label>
      Draft (localStorage, debounced) <input value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  )
}
