/**
 * Layout shell and state owner. Spec: F7, D8, D10, D14, section 6 (UI direction).
 *
 * EVERYTHING BELOW THIS COMMENT IS STILL THE VITE SCAFFOLD and gets deleted wholesale
 * with the first UI commit. Same for `App.css`, `index.css`, and `src/assets/*`.
 *
 * IMPLEMENT
 *
 *   const [state, dispatch] = useReducer(reducer, initialState)      // D14
 *
 *   const displayPolygon = useMemo(
 *     () => scale(rotate(state.polygon, state.rotation), state.size),
 *     [state.polygon, state.rotation, state.size])
 *
 *   const samples = useMemo(
 *     () => sampleMask(displayPolygon, state.sampleCount),
 *     [displayPolygon, state.sampleCount])
 *
 * Those two `useMemo`s are the reason nothing derived is stored in state (see the note in
 * `state/types.ts`). Without them, sampling would re-run on every unrelated render,
 * including every pointermove during a vertex drag.
 *
 * STRUCTURE
 *
 *   <main>
 *     <section class="wheel">     WheelCanvas + MaskOverlay stacked in one square box
 *     <aside class="panel">       MaskPanel
 *     <section class="samples">   SampleList + the sRGB caveat line (D10)
 *
 * Layout per spec section 6: wheel left, mask panel right, sample list below in a
 * 4-column grid. Desktop only — mobile layout is a non-goal (section 7), so no media
 * queries and no breakpoints.
 *
 * The wheel and its overlay must occupy the same square box. Give the container
 * `aspect-ratio: 1`, measure it with a ResizeObserver here, and pass the side length to
 * `WheelCanvas` as `size` (see the resize note in that file). Round it to whole pixels so
 * layout jitter cannot trigger a 125k-pixel recompute.
 *
 * The sRGB caveat (D10) is one line of plain text near the list, always visible: the
 * pipeline assumes sRGB, so on an uncalibrated monitor this plans relative harmony rather
 * than predicting absolute paint colour. The spec requires it to be stated in the UI.
 *
 * No router, no providers, no error boundary, no context (D8, D14). This component holds
 * the only state in the app and passes it down two levels at most.
 */

import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
