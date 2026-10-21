import { updateSettings, useKuna } from '../store'
import { THEMES } from '../themes'
import { closeOverlay, useOverlayKeys } from './Overlays'

export function SettingsDialog(): React.JSX.Element {
  const settings = useKuna((s) => s.settings)
  const fonts = useKuna((s) => s.fonts)
  const size = settings.termFontSize ?? fonts?.terminal.size ?? 12
  const index = Math.max(0, THEMES.findIndex((t) => t.id === settings.theme))

  useOverlayKeys((ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
      updateSettings({ theme: THEMES[(index + 1) % THEMES.length].id })
      return true
    }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
      updateSettings({ theme: THEMES[(index + THEMES.length - 1) % THEMES.length].id })
      return true
    }
    if (ev.key === '+' || ev.key === '=') {
      updateSettings({ termFontSize: Math.min(24, size + 1) })
      return true
    }
    if (ev.key === '-') {
      updateSettings({ termFontSize: Math.max(8, size - 1) })
      return true
    }
    if (ev.key === 'Enter') {
      closeOverlay()
      return true
    }
    return false
  })

  return (
    <div className="scrim" onMouseDown={closeOverlay}>
      <div className="dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Appearance</h2>
        <p className="dim">↑ ↓ to try a colour scheme — it applies immediately. Terminals stay pure black in all of them.</p>
        <div className="themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${t.id === settings.theme ? 'on' : ''}`}
              style={{ background: t.ground, borderColor: t.id === settings.theme ? t.accent : t.line, color: t.text }}
              onClick={() => updateSettings({ theme: t.id })}
            >
              <div className="tc-preview" style={{ borderColor: t.line }}>
                <div className="tc-side" style={{ background: t.panel, borderColor: t.line }}>
                  <i style={{ background: t.working }} />
                  <i style={{ background: t.waiting }} />
                  <i style={{ background: t.idle }} />
                  <i style={{ background: t.unread }} />
                </div>
                <div className="tc-pane" style={{ borderColor: t.accent }}>
                  <span style={{ color: t.accent }}>●</span> <span style={{ color: t.dim }}>agent working…</span>
                </div>
                <div className="tc-pane" style={{ borderColor: t.insert }}>
                  <span style={{ color: t.insert }}>▍</span>
                </div>
              </div>
              <div className="tc-name">{t.name}</div>
              <div className="tc-blurb" style={{ color: t.dim }}>
                {t.blurb}
              </div>
            </button>
          ))}
        </div>
        <div className="font-row">
          <span>Agent font</span>
          <span className="mono">{fonts?.terminal.faces?.regular ?? fonts?.terminal.family ?? '…'}</span>
          <button onClick={() => updateSettings({ termFontSize: Math.max(8, size - 1) })}>−</button>
          <span className="mono">{size}px</span>
          <button onClick={() => updateSettings({ termFontSize: Math.min(24, size + 1) })}>+</button>
          {settings.termFontSize !== undefined && fonts && settings.termFontSize !== fonts.terminal.size && (
            <button onClick={() => updateSettings({ termFontSize: undefined })}>Use {fonts.terminal.source}'s {fonts.terminal.size}px</button>
          )}
          <span className="dim">from {fonts?.terminal.source ?? '…'} · ⌘+ / ⌘− anywhere</span>
        </div>
        <div className="font-row">
          <span>Interface font</span>
          <button className={settings.uiFont !== 'editor' ? 'on' : ''} onClick={() => updateSettings({ uiFont: 'system' })}>
            System, like VS Code
          </button>
          <button className={settings.uiFont === 'editor' ? 'on' : ''} onClick={() => updateSettings({ uiFont: 'editor' })}>
            {fonts?.mono.family.split(',')[0].replace(/['"]/g, '') ?? 'Editor font'}
          </button>
          <span className="dim">editor font and sizes from your VS Code settings</span>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={settings.notify} onChange={(e) => updateSettings({ notify: e.target.checked })} />
          Notify me when an agent finishes or needs me while Kuna is in the background
        </label>
      </div>
    </div>
  )
}
