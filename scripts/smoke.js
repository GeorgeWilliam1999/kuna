// Run by scripts/smoke.sh inside the app: does the window render, does this
// Mac's host helper come up, and a screenshot to look at. Starts no agents.
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
    await sleep(500)
    await window.kunaDev.capture('smoke')
  } catch (err) {
    say('FAILED', String(err))
  }
  window.kunaDev.quit()
})()
