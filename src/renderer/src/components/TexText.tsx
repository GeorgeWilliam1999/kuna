import { Fragment } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { splitMath } from '@shared/tex'

const cache = new Map<string, string>()

function renderMath(tex: string): string {
  let html = cache.get(tex)
  if (html === undefined) {
    // a typo shows the formula in red instead of throwing
    html = katex.renderToString(tex, { throwOnError: false, strict: 'ignore' })
    cache.set(tex, html)
  }
  return html
}

/**
 * A project or folder name with its `$…$` math rendered by KaTeX. `bold`
 * matches the math to a bold name (KaTeX fonts ignore font-weight).
 */
export function TexText({ text, bold }: { text: string; bold?: boolean }): React.JSX.Element {
  const parts = splitMath(text)
  return (
    <>
      {parts.map((p, i) =>
        p.math ? (
          <span key={i} className="tex" dangerouslySetInnerHTML={{ __html: renderMath(bold ? `\\boldsymbol{${p.text}}` : p.text) }} />
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  )
}
