// Run by scripts/smoke.sh inside the app: does the window render, does this
// Mac's host helper come up, does a second window open and close, and a
// screenshot to look at. Starts no agents.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const S = () => window.kunaInternals.store.getState()
  const say = (...a) => console.log('[smoke]', ...a)
  try {
    for (let i = 0; i < 80 && !S().loaded; i++) await sleep(250)
    say('window:', document.querySelector('.app') ? 'ok' : 'FAILED (nothing rendered)')
    let host
    for (let i = 0; i < 120; i++) {
      host = S().hosts.local
      if (host && (host.status === 'ready' || host.status === 'error')) break
      await sleep(250)
    }
    if (host?.status === 'ready') say('this Mac: ok (helper installed, tmux found)')
    else say('this Mac: FAILED', host ? `${host.status}: ${host.error ?? ''}` : 'no host state')
    // a second window opens with its own panes and closes again
    await window.kunaDev.key('N', ['shift', 'meta'])
    for (let i = 0; i < 40 && S().windows.count < 2; i++) await sleep(250)
    const two = S().windows.count === 2
    await window.kunaDev.eval(1, "window.kunaDev.key('W', ['shift', 'meta'])")
    for (let i = 0; i < 40 && S().windows.count > 1; i++) await sleep(250)
    say('windows:', two && S().windows.count === 1 ? 'ok (a second one opened and closed)' : `FAILED (${S().windows.count} open)`)
    await sleep(500)
    await window.kunaDev.capture('smoke')
  } catch (err) {
    say('FAILED', String(err))
  }
  window.kunaDev.quit()
})()
