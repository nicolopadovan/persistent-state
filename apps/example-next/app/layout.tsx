import { PersistentStateProvider } from '@nicolopadovan/persistent-state/next'
import type { ReactNode } from 'react'
import { theme } from '../lib/state'
import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PersistentStateProvider states={[theme]}>{children}</PersistentStateProvider>
      </body>
    </html>
  )
}
