/**
 * Inlines the Vite build into ONE self-contained HTML file at the project root.
 *
 * Why: the app is a static, offline, client-side tool (D8). Needing a terminal and a
 * localhost URL to use it is friction with no purpose — there is no server-side anything.
 * With the script, the stylesheet and the favicon inlined, the result is a single file
 * that opens by double-clicking and keeps working with no network and no dev server.
 *
 * Deliberately hand-rolled rather than adding a plugin: the whole job is three string
 * replacements, and the project's rule is zero runtime dependencies with a very short
 * dev-dependency list.
 *
 * Usage: npm run bundle
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const OUT = 'gamut-mask.html'

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`No ${DIST}/index.html — run \`npm run build\` first.`)
  process.exit(1)
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8')

const assets = readdirSync(join(DIST, 'assets'))
const jsName = assets.find((f) => f.endsWith('.js'))
const cssName = assets.find((f) => f.endsWith('.css'))
if (!jsName || !cssName) {
  console.error('Expected one .js and one .css in dist/assets.')
  process.exit(1)
}

const js = readFileSync(join(DIST, 'assets', jsName), 'utf8')
const css = readFileSync(join(DIST, 'assets', cssName), 'utf8')

/**
 * A literal `</script>` anywhere in the bundle would close the tag early. Escaping it is
 * only safe inside a string literal, so this reports rather than silently mangling code.
 */
if (/<\/script/i.test(js)) {
  console.error('Bundle contains a literal "</script" — inlining would truncate it.')
  process.exit(1)
}
if (/<\/style/i.test(css)) {
  console.error('Stylesheet contains a literal "</style" — inlining would truncate it.')
  process.exit(1)
}

const before = html

/**
 * NOTE: every replacement below passes a FUNCTION, not a string.
 *
 * String replacements interpret `$&`, `` $` ``, `$'` and `$1`-`$9` as patterns, and a
 * 205 KB React bundle contains such sequences. The first version of this script used
 * strings, and `` $` `` — "everything before the match" — spliced the HTML head into the
 * middle of the inlined JavaScript. A replacer function disables that interpretation.
 */

// Stylesheet -> inline <style>
html = html.replace(
  new RegExp(`\\s*<link[^>]*href="[^"]*${cssName}"[^>]*>`, 'i'),
  () => `\n    <style>${css}</style>`,
)
// Module script -> inline <script type="module">
html = html.replace(
  new RegExp(`\\s*<script[^>]*src="[^"]*${jsName}"[^>]*></script>`, 'i'),
  () => `\n    <script type="module">${js}</script>`,
)
// Favicon -> data URI, so the tab icon survives too
if (existsSync(join(DIST, 'favicon.svg'))) {
  const svg = readFileSync(join(DIST, 'favicon.svg'), 'utf8').trim()
  html = html.replace(
    /<link rel="icon"[^>]*>/i,
    () =>
      `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`,
  )
}

if (html === before) {
  console.error('Nothing was inlined — the dist HTML did not match the expected shape.')
  process.exit(1)
}
// Check the markup only. Scanning the whole file would false-positive on strings that
// happen to appear inside the bundled JavaScript.
const markup = html
  .replace(/<script type="module">[\s\S]*?<\/script>/, '')
  .replace(/<style>[\s\S]*?<\/style>/, '')
if (/(src|href)="\.?\/(assets|favicon)/.test(markup)) {
  console.error('An external reference survived; the file would not be self-contained.')
  process.exit(1)
}

writeFileSync(OUT, html)
const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(`\n  ${OUT}  ${kb} KB  — self-contained, open it by double-clicking.\n`)
