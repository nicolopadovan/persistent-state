'use client'

import { useStoredState } from '@nicolopadovan/persistent-state/react'
import type { ReactNode } from 'react'
import { theme } from '../lib/state'

export function ThemeScope({ children }: { children: ReactNode }) {
  const [value, setValue] = useStoredState(theme)
  return (
    <main data-theme={value}>
      <button onClick={() => setValue(value === 'dark' ? 'light' : 'dark')}>
        Theme (cookie): <output id="theme">{value}</output>
      </button>
      {children}
    </main>
  )
}
