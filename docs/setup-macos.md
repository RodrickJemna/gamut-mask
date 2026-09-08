# Setup — macOS, Apple Silicon (arm64)

Homebrew, Xcode Command Line Tools és git nélkül. Minden lépés után van egy
ellenőrző parancs; ha az nem azt adja, ami ott áll, ne menj tovább.

---

## 0. Terminál és architektúra

Terminal.app: `Cmd+Space` → `Terminal` → Enter.

```bash
uname -m
```
Elvárt: `arm64`

```bash
sw_vers -productVersion
```
Elvárt: a macOS verziószámod. Csak feljegyzésre, ha később valami furcsa.

---

## 1. Ami már esetleg fent van

```bash
node -v; npm -v; git --version
```
Elvárt: `command not found` mindháromra (vagy git esetén egy CLT-telepítő popup —
azt most **Cancel**-lel zárd be, nem kell).

---

## 2. Node 24 LTS telepítése (natív .pkg)

**Fontos**: a macOS `.pkg` a nodejs.org-on univerzális (arm64 + x64 egy fájlban),
tehát a nevében **nincs** `-darwin-arm64` — az csak a `.tar.gz` tarballoknál van.
A verziószámot nem égetem be, a letöltő maga keresi meg a legfrissebb 24-est:

```bash
cd ~/Downloads && \
PKG=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/ | grep -o 'node-v[0-9][0-9.]*\.pkg' | head -1) && \
echo "Letöltendő: $PKG" && \
curl -fL -O "https://nodejs.org/dist/latest-v24.x/$PKG"
```
Elvárt: kiírja a fájlnevet (`node-v24.x.y.pkg`) és letölti. Ha a `Letöltendő:` után
nem áll semmi, a grep nem talált — ilyenkor a lenti böngészős út.

```bash
ls -lh ~/Downloads/node-v24*.pkg
```
Elvárt: egy fájl, ~60–90 MB.

> Böngészős út: <https://nodejs.org/en/download> → macOS / LTS / `.pkg`, letöltés a
> `~/Downloads`-ba, és folytasd a következő paranccsal (a fájlnévvel, amit kaptál).

Telepítés (a rendszer jelszavát kéri):

```bash
sudo installer -pkg ~/Downloads/node-v24*.pkg -target /
```
Elvárt: `installer: The install was successful.`

**Nyiss egy új Terminal ablakot** (`Cmd+N`), hogy a PATH frissüljön, majd:

```bash
node -v; npm -v; which node; node -p process.arch
```
Elvárt: `v24.` kezdetű verzió, egy npm verzió, `/usr/local/bin/node`, és `arm64`.
Ha az utolsó `x64`, akkor a Terminal Rosetta alatt fut — az javítandó, mielőtt
továbbmegyünk.

---

## 3. Szerkesztő

VS Code, arm64 build: <https://code.visualstudio.com/download> → **Mac (Apple Silicon)**.
A letöltött `.zip`-et a Finderben csomagold ki, és a `Visual Studio Code.app`-ot húzd az
`Applications` mappába. Első indításnál a Gatekeeper rákérdez, engedélyezd.

Ellenőrzés: elindul és megnyílik.

Opcionális, de kényelmes: `Cmd+Shift+P` → `Shell Command: Install 'code' command in PATH`.
Utána új Terminalban:

```bash
code --version
```

Ha más szerkesztőt szeretnél, teljesen mindegy — a projekt nem függ tőle.

---

## 4. Projekt létrehozása

```bash
mkdir -p ~/dev && cd ~/dev && \
npm create vite@latest gamut-mask -- --template react-ts
```
Elvárt: létrejön a `~/dev/gamut-mask` mappa.

A `create-vite` 9.x két dolgot kérdez:
- **Which linter to use?** → ESLint. (Dev-only függőség, a spec stackjéhez képest plusz,
  de hasznos.)
- **Install with npm and start now?** → Yes. Ezzel elvégzi az `npm install`-t és
  el is indítja a dev szervert, tehát külön `npm install` / `npm run dev` nem kell.

Elvárt a végén: `VITE v8.x ready`, majd `Local: http://localhost:5173/`.

**Ez a parancs nem áll le magától** — előtérben futó szerver. Nyisd meg
böngészőben a fenti URL-t (a Vite alap React oldala, számláló gombbal), aztán
`Ctrl+C` a leállításhoz.

---

## 5. Fejlesztői függőség

```bash
cd ~/dev/gamut-mask && npm i -D vitest
```

```bash
npx vitest --version
```
Elvárt: egy verziószám. Runtime függőség nincs — az Oklab konverzió saját kód.

---

## 6. Git

Szándékosan kihagyva. Amikor jön, külön lépés lesz: `.gitignore` először
(`node_modules`, `dist`, `.DS_Store`), aztán kis, logikus commitok.

---

## Amit innen nem tudok ellenőrizni

- A `nodejs.org/dist/latest-v24.x/` könyvtárlista formátumát nem tudom lekérni (a
  futtatókörnyezetem nem éri el a domaint). Az első változat ezért hibás grep-minta
  volt (`-darwin-arm64.pkg`, ami nem létezik); javítva. A böngészős fallback ezért van.
- A VS Code letöltési oldal aktuális gomb-elnevezését nem ellenőriztem, csak a domaint.
- A `vitest` CLI pontos verzió-flagjét nem ellenőriztem, csak azt, hogy a parancs
  létezik ebben az eszközben.
