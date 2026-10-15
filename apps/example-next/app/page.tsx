import { readState } from '@nicolopadovan/persistent-state/next'
import { Draft } from '../components/draft'
import { ThemeScope } from '../components/theme-scope'
import { theme } from '../lib/state'

export default async function Page() {
  const serverTheme = await readState(theme)
  return (
    <ThemeScope>
      <h1>persistent-state</h1>
      <p>
        Theme read on the server: <output id="server-theme">{serverTheme}</output>
      </p>
      <Draft />
    </ThemeScope>
  )
}
