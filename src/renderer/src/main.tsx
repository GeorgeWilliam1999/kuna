import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import * as actions from './actions'
import { App } from './App'
import { useKuna } from './store'
import * as terminals from './terminals'

// handle for scripted runs (KUNA_AUTOMATION) and debugging from devtools
Object.assign(window, { kunaInternals: { store: useKuna, actions, terminals } })

createRoot(document.getElementById('root')!).render(<App />)
