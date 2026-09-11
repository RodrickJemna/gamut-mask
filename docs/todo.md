# Todo — asked for, not built

The queue of features the author has asked for that are not implemented yet, newest
request first. Each entry records what is already known, so the thinking does not have to
be redone when the item comes up.

This is NOT the place for deferred decisions or known issues — those live where they are
already written down: withdrawn decisions in `gamut-tool-spec.md` section 5, non-goals in
section 7, and the open technical questions in `implementation-plan.md` section 6.

Both items below collide with a section 7 non-goal. That is not a blocker — D11 said paint
matching was out "not even later" and came back as D40 — but it is a decision the author
makes explicitly, and the non-goal gets moved with its reason recorded, not quietly
ignored.

---

## 1. Colour mixer

**The ask.** Hovering a colour in the mask list shows which paints to mix to reach it.
Planned in conversation (a hover-driven mix finder); nothing is implemented.

**Non-goal to reopen:** section 7, "Keverés-szimuláció" (mixing simulation). It was listed
alongside paint matching, which has since come back as D40 — and D57 is what makes this
worth reopening at all: mixing is only a useful answer out of the bottles you actually
own, and the shelf now exists.

**What is already known.**

- The approach explored is **single-constant Kubelka-Munk**: convert each paint's
  reflectance to `K/S = (1 - R)^2 / 2R`, mix K/S linearly by volume fraction, invert back
  to reflectance. It behaves like paint where linear RGB mixing does not — blue + yellow
  goes green rather than grey. The formula was checked; **no code exists in `src/`**.
- It needs a reflectance per paint. The catalogues hold one printed sRGB swatch each, so
  the input is a three-channel approximation of a spectrum, not a spectrum. That bounds
  how good any answer can be, and the UI has to say so the way D10 does for the disk.
- Search space: pairs from a sixty-bottle shelf is ~1800 combinations times a ratio grid,
  which is fine; triples are not, and probably not useful either — nobody mixes three
  hobby paints to hit a target by eye.
- The honest output is a ratio, a predicted colour and the distance to the target, in the
  same Oklab percentage the match rows already use (`differencePercent`).

**Open question, worth settling first:** whether a mix that is 3% off beats a single
bottle that is 5% off. A mixed answer costs the painter real effort and is not
repeatable by hand, so the threshold is not the same one matching uses.

## 2. Import / export the paint inventory

**The ask.** Get the shelf out of one browser and into another, or onto disk.

**Non-goal to reopen:** section 7 bans "PNG / text / JSON export" (D13, partially
withdrawn already by D43's PDF sheet) and "megosztható link".

**What is already known — most of this is built.**

- `encodeOwned` / `decodeOwned` in `paints/inventory.ts` already are the portable format:
  a versioned, base64url key list that names the paints rather than their positions, so a
  re-extracted catalogue cannot mis-decode an old token (D57). Unknown keys are dropped
  and counted, never guessed.
- **`inventoryLink()` in `state/persist.ts` is written and unused.** It returns the current
  page URL with the shelf token in the fragment. It was written for a copy button that was
  never added — so it is dead code until this item lands.
- That makes the cheap version genuinely cheap, and it sidesteps the export non-goal
  entirely: a **Copy shelf link** button plus a **Paste shelf** field, moving the token
  that already exists. No new format, no file I/O, no JSON.
- A file version, if wanted on top: the same token written to a `.txt`, using the existing
  `export/download.ts`. The format stays the token, so there is one thing to keep
  compatible rather than two.
- Merge or replace on paste is a real choice: replace is simpler and loses the target
  machine's shelf; merge cannot be undone (inventory edits are outside the undo stack by
  D57). Whichever it is, say it on the button.
