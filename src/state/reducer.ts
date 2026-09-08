/**
 * The reducer. Spec: D14, D22, D23, F2, D17.
 *
 * IMPLEMENT
 *
 *   const initialState: AppState        // triad preset, rotation 0, size 1, N 12
 *   reducer(state: AppState, action: Action): AppState
 *
 * Pure, no side effects, returns a new object on change and the **same object** when
 * nothing changed — a `moveVertex` to an identical position should not re-render.
 *
 * INVARIANTS the reducer owns
 *
 *   - >= 3 vertices (F2). `deleteVertex` is a no-op at 3. The overlay should also hide or
 *     disable the delete affordance there, but the guard lives here so no path can break
 *     it.
 *   - Every stored vertex is inside the disk (D22): run `clampToDisk` in `addVertex` and
 *     `moveVertex`. Note that `moveVertex` stores *base* coordinates, so it must first
 *     unmap the incoming display-space point through the current rotation and size, then
 *     clamp. Getting that order wrong makes vertices jump when the mask is rotated —
 *     the most likely bug in this file.
 *   - `sampleCount` clamped to 4..32 (D17).
 *   - `size` clamped to a sane band (say 0.05..1) so the mask cannot vanish or invert.
 *   - `rotation` normalised to [0,360) so it does not accumulate unbounded.
 *
 * `loadPreset` replaces `polygon` outright and resets `preset`, per D23 — no confirmation
 * even when the current shape was hand-drawn. It should also reset `rotation` to 0 and
 * `size` to 1, since a preset is defined at its own orientation and scale; carrying over a
 * 200 deg rotation would make the preset buttons look broken. Not spelled out in the spec,
 * but the alternative is worse — flagging it as a judgement call.
 *
 * `addVertex` takes an insertion index because a new vertex must go **between** two
 * existing ones to keep the ring's shape (F2). The overlay computes it: hit-test the
 * click against each edge segment and insert after the nearest edge's first vertex.
 * Appending at the end instead produces a random-looking spike, which reads as a bug.
 *
 * `preset` becomes `null` on any vertex edit — the shape is no longer that preset. It is
 * only used to light up the active preset button.
 *
 * No test file: CLAUDE.md restricts tests to colour maths and geometry. The clamp and
 * min-vertex logic here is thin glue over `geom/polygon.ts`, which is tested. If the
 * unmap-then-clamp ordering in `moveVertex` proves fragile, that one is worth a test and
 * belongs in `geom/transform.test.ts` as a round-trip property.
 */
