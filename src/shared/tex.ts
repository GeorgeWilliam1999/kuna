/**
 * Inline math in project and folder names: `$\tau\tau$ analysis`. The UI
 * renders the math with KaTeX; places that only take plain text (tooltips,
 * confirmations) get a Unicode approximation from `texToText`.
 */

export interface TexPart {
  text: string
  math: boolean
}

/** Split a name into text and `$…$` math. `\$` is a literal dollar; a `$` without a partner stays text. */
export function splitMath(s: string): TexPart[] {
  const parts: TexPart[] = []
  let buf = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && s[i + 1] === '$') {
      buf += '$'
      i += 2
      continue
    }
    if (c === '$') {
      let j = i + 1
      while (j < s.length && !(s[j] === '$' && s[j - 1] !== '\\')) j++
      if (j < s.length && s.slice(i + 1, j).trim()) {
        if (buf) parts.push({ text: buf, math: false })
        buf = ''
        parts.push({ text: s.slice(i + 1, j), math: true })
        i = j + 1
        continue
      }
    }
    buf += c
    i++
  }
  if (buf) parts.push({ text: buf, math: false })
  return parts
}

export function hasMath(s: string): boolean {
  return splitMath(s).some((p) => p.math)
}

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', ell: 'ℓ', hbar: 'ℏ', partial: '∂', nabla: '∇', infty: '∞',
  to: ' → ', rightarrow: ' → ', leftarrow: ' ← ', leftrightarrow: ' ↔ ', Rightarrow: ' ⇒ ',
  pm: '±', mp: '∓', times: '×', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', sim: '∼', propto: '∝', sqrt: '√', sum: '∑', int: '∫', prime: '′', circ: '∘',
  ',': ' ', ';': ' ', ':': ' ', '!': '', quad: ' ', qquad: ' ', '{': '{', '}': '}', '%': '%', '&': '&', '_': '_'
}
const ACCENTS: Record<string, string> = { bar: '̄', overline: '̄', tilde: '̃', hat: '̂', vec: '⃗', dot: '̇' }
const STYLES = new Set(['mathrm', 'text', 'textrm', 'mathit', 'mathbf', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'boldsymbol', 'operatorname'])
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', '*': '*', '′': '′'
}
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ'
}

/** Plain-text approximation of a TeX formula (`\tau^+\tau^-` → `τ⁺τ⁻`). */
function mathToText(tex: string): string {
  let i = 0
  // one argument: a {group}, a \command or a single character
  const arg = (): string => {
    while (tex[i] === ' ') i++
    if (tex[i] === '{') {
      let depth = 0
      const start = i + 1
      for (; i < tex.length; i++) {
        if (tex[i] === '{') depth++
        else if (tex[i] === '}' && --depth === 0) break
      }
      const inner = tex.slice(start, i)
      i++
      return mathToText(inner)
    }
    if (tex[i] === '\\') return command()
    return tex[i++] ?? ''
  }
  const command = (): string => {
    i++ // backslash
    const m = /^[A-Za-z]+|^./.exec(tex.slice(i))
    const name = m?.[0] ?? ''
    i += name.length
    if (name in ACCENTS) return [...arg()].map((c) => c + ACCENTS[name]).join('')
    if (STYLES.has(name)) return arg()
    if (name === 'frac') {
      const a = arg()
      return `${a}/${arg()}`
    }
    return SYMBOLS[name] ?? name
  }
  let out = ''
  while (i < tex.length) {
    const c = tex[i]
    if (c === '\\') out += command()
    else if (c === '^' || c === '_') {
      i++
      const map = c === '^' ? SUP : SUB
      const a = arg()
      out += [...a].every((ch) => ch in map) ? [...a].map((ch) => map[ch]).join('') : `${c}${a}`
    } else if (c === '{' || c === '}' || c === ' ') i++
    else {
      out += c
      i++
    }
  }
  return out
}

/** A name as plain text: the math parts approximated in Unicode. */
export function texToText(s: string): string {
  return splitMath(s)
    .map((p) => (p.math ? mathToText(p.text).replace(/\s+/g, ' ') : p.text))
    .join('')
}
