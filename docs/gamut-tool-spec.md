# Gamut Mask Tool — spec

Verzió: 0.16
Státusz: FÁZIS 2 — v1 leimplementálva. A design zárva; a 4. pont D38–D39 tételei és a
D35 pontosítása implementáció közbeni mérésekből származnak.

---

## 1. Cél

Miniatűr-festéshez való gamut mask szerkesztő. Mask felvétele egy YURMBY-színkörön, és
a maskon belüli színek felsorolása. Képernyőn használatos, session-alapú eszköz.

Nem képszerkesztő, nem keverés-szimulátor, nem value-tervező. Festék-illesztés a
0.11 óta van (D40).

Referencia: James Gurney, *Color and Light* — gamut masking, YURMBY-kör.

---

## 2. A kör modellje

- **Szög** = YURMBY hue. Piros fent, onnan óramutató járása szerint. A hat anchor
  (R, Y, G, C, B, M) pontosan 60°-onként, mert a szög közvetlenül az sRGB hue-hexagon
  szöge. Komplementerek szemben: R↔C, Y↔B, G↔M.
- **Perem** = az adott hue teljesen telített sRGB színe. Ez definíció szerint a
  maximális chroma az adott hue-n, tehát nem kell hozzá gamut-keresés.
- **Közép** = semleges szürke, Oklab `L = 0.6`.
- **Rádiusz** `t ∈ [0,1]` = a közép és a perem közti interpoláció, **Oklabban**
  számolva. Hue-nként normalizált: `t = 0.7` azt jelenti, hogy „az adott hue teljes
  telítettségének 70%-a felé", nem egy absztolút chroma-értéket.
- A diszk kerek, nincs elérhetetlen terület.
- **Mask** = zárt polygon a körön.
- **Sample** = a maskon belüli egy szín, ami megjelenik az alsó listában.

---

## 3. v1 scope (must-have)

| # | Feature | Megjegyzés |
|---|---|---|
| F1 | A kör per-pixel renderelése canvasra | egy ImageData cache, csak resize-nál újraszámol |
| F2 | Szabad polygon szerkesztő: vertex add / del / drag, min. 3 pont | SVG overlay |
| F3 | Hat anchor-sugár + R Y G C B M betűk | állandó, nem elrejthető |
| F4 | Mask presetek: triád, split-komplementer, analóg ék, atmoszférikus | paraméteres |
| F5 | Mask rotálása a közép körül + skálázása + **mozgatása** (D42) | Gurney-workflow |
| F6 | A maskon belüli színek listája: swatch + hex + világosság + telítettség | auto rács, N csúszka |
| F7 | Semleges (mid-grey) UI chrome | szimultán kontraszt miatt követelmény |

### „Done" v1-re
A felhasználó felvesz egy maskot (presetből vagy szabadon), állítja a méretét és
szögét, és látja alatta a maskon belüli színeket. Semmi több.

---

## 4. Érvényes döntések

- **D35 — A kör modellje** a 2. pont szerint: YURMBY-szög, teljesen telített sRGB
  perem, Oklab `L = 0.6` semleges közép, hue-nként normalizált rádiusz, Oklabban
  interpolált átmenet.
  - **Miért Oklab az interpoláció**: sRGB-ben lineárisan szürkébe húzni látható sarat
    csinál a köztes gyűrűkben, pont ott, ahol a tompított paletták vannak. ~30 sor,
    se tábla, se keresés, a felhasználó nem is látja. Ez az egyetlen hely, ahol
    perceptuális színtér szerepel a rendszerben.
  - **Az ára, kimondva**: két különböző hue ugyanolyan radiális pozíciója nem
    összemérhetően telített. Hue-n belül a „kifelé telítettebb" gyakorlatilag igaz, de
    **nem pontosan** — ez a 0.10-ben mérésből derült ki. A nyers interpoláció chromája
    monoton, viszont a D3 chroma-redukció a gamut határára vág, és a határ chromája
    adott `L`-en szűkül, ahogy `L` a sötét perem felé esik. A kék környékén a
    centrum–perem szakasz kilóg a gamutból, ezért a chroma legfeljebb `2.3e-4`-lel
    (0,08%, egy 8-bites lépés kb. ötöde) visszaesik, 720 mért hue közül ~10-en. Nem
    látható, de nem nulla. A `wheel.test.ts` korlátos guardként tartja, nem törölte.
- **D3 — Gamut**: konstrukció szerint minden pont sRGB-ben van. Az Oklab-interpoláció
  numerikusan kilóghat; ilyenkor chroma-redukció (`a`, `b` skálázása) az adott `L`-en,
  amíg befér. Nincs csendes csatorna-clip.
- **D32 — Oklab konverziós mátrixok**: Ottosson eredetije
  (bottosson.github.io/posts/oklab), lineáris sRGB ↔ Oklab irányban, keresésen
  ellenőrizve. XYZ-n nem megyünk át.
- **D37 — Nincs színkönyvtár-függőség.** A `culori` kiesett: 30 sor ellenőrzött matek
  nem ér meg egy dependencyt. Runtime dep a Reacten kívül nulla.
- **D30 — Per-pixel renderelés**, nem szegmens-legyező. Sima átmenet.
- **D4 — Canvas a körnek, SVG overlay a mask-handle-eknek.** Hit-testing SVG-ben
  triviális; WebGL felesleges (~125k pixel, egy cache-elt ImageData).
- **D21 — Orientáció**: piros fent, óramutató szerint. Y 2 óránál, G 4-nél, C 6-nál,
  B 8-nál, M 10-nél.
- **D34 — A hat anchor állandóan kirajzolva**: sugár a középtől a peremig + betű a
  körön kívül.
- **D22 — Vertex-clamp**: a polygon vertexei nem mehetnek a diszk peremén túl, a
  határra ragadnak. Rotálásnál is.
- **D23 — Presetek rádiusz-arányban definiálva.** Preset betöltése felülírja az
  aktuális polygont, megerősítés nélkül.
- **D24 — Nem-konvex polygon engedve**, even-odd szabállyal. Önátmetszés nincs tiltva.
- **D17 — Determinisztikus mintavételezés**: fix rács a maskon belül, rácsméret
  binárisan keresve N-hez, majd 2–3 Lloyd-iteráció. Random mintavétel a mask minden
  mozgatásánál újravillogó listát adna. N default 12, range 4–32. Rendezés szög szerint.
- **D25 — Túl kicsi mask**: ha N minta nem fér el, kevesebb jön, és a UI a tényleges
  számot írja ki.
- **D28 — A maskon kívüli terület tompítva**, nem kivágva: fekete wash a körön belül,
  a polygonon kívül (even-odd fill-rule egy path-on). Megmarad a viszonyítás.
- **D36 — A lista soronként**: swatch, hex, világosság (Oklab `L`, 0–100), telítettség
  (`t`, 0–100%). Kattintásra hex a vágólapra. Ha a két szám feleslegesnek bizonyul,
  könnyen kivehető.
- **D16 — Nincs value/L tengely és nincs L slider.** Következmény: minden mintának van
  egy származtatott világossága, amit nem a felhasználó választ. A lista kiírja, de ez
  következmény, nem terv. A value-tervezés a felhasználónál marad.
- **D10 — A pipeline sRGB-t feltételez.** Kalibrálatlan monitor → relatív harmóniát
  tervez, nem absztolút festékszínt jósol. A UI-ban kiírva.
- **D12 — Nincs kép-input, sem később.**
- **D18 — Az állapot JSON-serializálható alakú**, hogy a későbbi mentés ne igényeljen
  refaktort. Perzisztencia-kód viszont nincs benne.
- **D8 — Nincs backend, account, router.** Statikus, offline app.
- **D14 — Nincs zustand.** `useReducer` elég.
- **D26 — A UI nyelve angol.** Nincs i18n réteg.
- **D40 — Festék-illesztés (a D11 visszavonása)**: minden minta mellett megjelenik a
  hozzá legközelebbi AK festék, vagy „No paint found", ha a legközelebbi is túl messze
  van. Új követelmény nyomán; a D11 a 5. pontba került.
  - **Metrika**: euklideszi távolság **Oklabban**. Ez az, amire az Oklab jó — az egyenlő
    numerikus lépések közelítőleg egyenlő perceptuális lépések —, tehát a
    „legközelebbi Oklabban" védhető, a „legközelebbi sRGB-ben" nem lenne az.
  - **Tolerancia**: 5%, ahol a 100% egységnyi Oklab-távolság (kb. a fekete–fehér
    szakasz). A döntés a **kijelzett, kerekített** százalékon történik, nem a nyers
    távolságon, hogy a kettő soha ne mondjon mást: e nélkül volt olyan sor, ami
    „No paint found" mellé „Δ5%"-ot írt (0,0504 → 5-re kerekül, de nagyobb 0,05-nél).
  - **Miért jó szám az 5%**: mérve a teljes diszken. A közel-semleges sávban (`t < 0.2`)
    100% talál festéket, a peremen (`t > 0.8`) csak 27%, összesen ~59%. Ez fizikailag
    helyes: valódi pigment nem éri el az sRGB primerek telítettségét, tehát a
    „nincs festék" a peremen csoportosul, és ez információ, nem hiba.
  - **Az adat, kimondva**: a katalógus **nyomtatott swatch-színei**, nem megszáradt
    festék méréssel. A D10 szerint a pipeline sRGB-t feltételez és nem jósol absztolút
    festékszínt — a találat azt jelenti, hogy „ez a tégely a színtér jó környékén van",
    nem azt, hogy „ez a tégely ilyen színű". A UI kiírja.
  - **Kizárva**: segédmédiumok és lakkok (AK11231–11235, RC801–803). A swatch-ük
    placeholder szürke — az öt AK medium mind `#636363` —, tehát bennhagyva bármelyik
    semleges minta a „Matte Medium"-ra illeszkedett volna.
- **D45 — JPEG-lap export**: ugyanaz a lap, mint a PDF (D43), egyetlen JPEG-ként.
  - **Egy layout, két kimenet**: a pozicionáló kód közös, egy `Surface` interfészen
    keresztül — a PDF `Content` és a `CanvasSurface` ugyanazt implementálja. Két külön
    layout (egy PDF-hez, egy canvashoz) az első változtatásnál elcsúszott volna.
  - **Minden felület a saját metrikájával mér** (`measure`): a PDF a base-14 közelítéssel,
    a canvas `measureText`-tel. Így a jobbra igazított számok és a levágott festéknevek
    mindkét kimenetben helyesek, nem csak az egyikben.
  - **A JPEG nincs lapokra tördelve** — egy folytonos lap. Egy képnek nincsenek lapjai,
    amiket a néző lapozhatna. Következmény: a magasság csak a layout lefutása után derül
    ki, a canvasnak viszont előre kell a méret, ezért a layout **kétszer** fut: egyszer
    egy csak-mérő felületen, majd a valódi canvason.
  - **A kör ugyanabból a rendererből jön**, és abból a canvasból van kirajzolva, amiből a
    JPEG-je kódolódott — nem a bájtok visszadekódolásából, mert az aszinkron. Így a két
    export nem tud eltérni abban, hogy hogyan állt a mask.
  - **Fájlnév**: ugyanaz a hash, más kiterjesztés (`gamut-eb2834a9.pdf` /
    `gamut-eb2834a9.jpg`), tehát a pár egymás mellé rendeződik és látszik, hogy ugyanaz a
    lap. 2,5× skála, ~1490px széles, ~208 KB.
- **D44 — Két gyártó, brandenként külön illesztés**: minden mintához az AK **és** a
  Vallejo katalógusból is a legközelebbi festék, és a lista azt sorolja fel, amelyik az
  5%-os toleranciába esik — mindkettőt, ha mindkettő, egyet, ha csak egy, és
  „No paint found", ha egyik sem.
  - **Miért brandenként, nem globálisan**: egy globális legközelebbi elrejtené, hogy a
    másik gyártónál is van használható tégely — pont ez a két katalógus értelme.
  - **Fedettség, mérve**: az AK egyedül a diszk 63,0%-át fedi 5%-on belül, a Vallejo
    69,8%-át, együtt **73,4%**-ot; a diszk 59,4%-án mindkettőnél van találat. A maradék
    26,6% továbbra is a perem, ahol valódi pigment nem ér el.
  - **650 Vallejo szín**: Model Color, Model Air, Game Color, Game Air, Mecha Color.
  - **A színek raszterizált lapról vannak mintavételezve, nem a rect fill-jéből.** Egyes
    lapokon a swatch fill rendes RGB-hármas, máshol — a 13. lapon 106-ból 86 esetben —
    egyetlen float, mert a rect olyan színtérben van festve, amit a pdfplumber nem old
    fel, és egy komponenst ad vissza. Erre hagyatkozva a „71.002 Medium Yellow"
    `#000000` lett. **A módszer validálva**: a 12. lapon, ahol minden fill rendes
    RGB-hármas, a mintavételezett pixelek mind a 121 deklarált színt **0 csatorna-hibával**
    reprodukálták.
  - **A range a kódprefixből jön** (69/70/71/72/76), nem abból, melyik lapon találtuk: a
    chart-lapok más range-ekre is hivatkoznak (a Game Air lapon 51 saját kód mellett 7
    Model Color kód van), lap szerint címkézve ezek hibás range-et kaptak volna. A
    73.xxx (pigmentek, washok, textúrák) kizárva, ahogy az AK-nál is.
  - **Kizárva**: lakkok és médiumok (17 ref), amiknek a swatch-e üres fehér — bennehagyva
    bármelyik közel-fehér minta a „Matt Varnish"-ra illeszkedett volna. A 70.951 White
    viszont valódi festék, marad.
- **D43 — PDF-lap export (a D13 részleges visszavonása)**: egy gomb legenerálja az
  aktuális állapot nyomtatható A4-es lapját — a kör a maskkal, a mask beállításai, és a
  maskon belüli színek a festék-találatokkal.
  - **Hová kerül**: a böngésző letöltési mappájába. Egy weboldal **nem** tud a saját
    HTML-je mellé mappát létrehozni és oda írni — ilyen API nincs; ami a legközelebb áll
    hozzá (File System Access), az felhasználó által adott könyvtár-handle-t igényel,
    Safariban nincs meg, és `file://` originon amúgy sem működik. A letöltés az egyetlen
    elérhető mechanizmus, és a szerző ezt választotta.
  - **Fájlnév**: `gamut-<8 hex>.pdf`, a színek sorrendezett listájából FNV-1a hash-elve.
    Determinisztikus: ugyanaz a paletta ugyanazt a nevet adja, tehát egy már mentett
    paletta újraexportálása nem szemeteli tele a mappát közel-azonos lapokkal. A sorrend
    beleszámít, mert két azonos színkészlet más elrendezésben más paletta.
  - **Nincs runtime dependency** (D37): a PDF-író saját, ~250 sor. Egy oldal, kitöltött
    téglalapok, base-14 Helvetica és egy beágyazott JPEG — ez nem indokol jsPDF-et.
  - **A kör bitmapként, minden más igazi PDF-szövegként és vektorként** megy bele, tehát
    a lap élesen nyomtat, a hex-kódok kijelölhetők belőle, és a fájl kicsi (~80 KB).
  - **A kör overlay-ét újrarajzoljuk, nem szerializáljuk**: az SVG színei CSS custom
    property-kből jönnek, amik nem oldódnak fel, ha az SVG kikerül a dokumentumból — a
    hiba úgy nézett volna ki, hogy „a mask kontúrja eltűnt a PDF-ből".
  - **Szövegkódolás**: a base-14 Helvetica `/WinAnsiEncoding`-gal van deklarálva, és a
    szöveg WinAnsi bájtokra kódolva. A katalógusban van `ü`, `ä` és `º`; UTF-8-cal ezek
    mojibake lettek volna.
  - **Hasábok**: 2, illetve 3 ha 24-nél több szín van — 32 színnel 2 hasábbal a tartalom
    kifut a lábléc alá. Ez renderelt lapon lett ellenőrizve, nem számolással.
- **D42 — A mask mozgatása húzással**: a maskon *belül* húzva az egész mask elmozdul a
  körön. A vertexeken és az éleken való húzás/kattintás változatlan.
  - **Hol tárolódik**: `offset: Point` az állapotban, base-térben, **a rotáció és a
    skálázás előtt** alkalmazva. Így a rotálás továbbra is *körbeviszi* az elcsúsztatott
    maskot a körön, nem a helyben forgatja — ez a természetes olvasat, és egyben az, amit
    a D38 (atmoszférikus preset) is feltételez.
  - **Miért skalár, nem a vertexekbe beégetve**: ugyanaz az érv, mint a rotációnál és a
    méretnél. A D22 clamp lossy: a peremre húzott mask vertexei odaragadnak, és ha ezt a
    tárolt polygon szenvedné el, a visszahúzás nem állítaná helyre az alakot. Mérve:
    böngészőben a maskot a peremig húzva egy vertex tényleg beragad, visszahúzva viszont
    az alak **pontosan** visszaáll (max. eltérés 0).
  - **Az `offset` a diszkre van clampelve**, tehát a mask nem hajítható el a körről —
    a peremen megáll és visszahúzható.
  - **Amit felad**: egy elcsúsztatott masknál a vertex „rádiusz = telítettség, szög =
    hue" olvasata már nem a mask saját középpontjához képest értendő. Ez szándékos: a
    felhasználó szemre pozicionál.
  - **A húzás abszolút, nem inkrementális**: az akció a *kezdő* offsetet és a
    display-térbeli deltát viszi, nem lépésenkénti növekményt, így egy elveszett vagy
    összevont pointermove nem visz el a mask alól a kurzort.
- **D41 — Egy-viewportos layout**: a három régió (kör, panel, színlista) egymás mellett,
  `100dvh` magasságra kötve, lapszintű scroll nélkül. Ez felülírja a 6. pont eredeti
  „színlista alatta" tagolását.
  - **Miért**: a lista a kör alatt egy laptopon a fold alá esett, és a felhasználó
    **festés közben nem tud scrollozni** — nedves ecsettel ez nem elérhető interakció.
    A hiba nem esztétikai volt, hanem használhatatlanná tette a fő munkafolyamatot
    (mask állítása és a hozzá tartozó festékek egyidejű olvasása).
  - **A kör mérete oszthatóan van megadva** (`0.85fr`), `max-width: 470px` felső korláttal.
    Fix 470px-nél egy 1280×720-as laptopon a listának csak 506px maradt — egy hasáb —, és
    a lista 12 színnél is 273px-szel túlcsordult. Az arányos szélesség ott ad fel helyet,
    ahol szűkös, és a korlát megakadályozza, hogy a diszk a hasznosnál nagyobb legyen.
  - **A kártya minimum 280px**, mérés alapján: 238px-nél befér a harmadik hasáb és még egy
    32 színű lista is kiférne, de a festéknevek ~10 karakterre csonkultak („AK11277 R…") —
    egy elolvashatatlan festéknév értelmetlenné teszi az illesztést. 320px-nél semmi nem
    csonkul, de 1280 szélességnél egy hasábra esik vissza. A 280 kettőt tart 1280-ig.
  - **Ami marad**: nagyon magas színszámnál (kb. 20 fölött) a **lista hasáb** scrolloz
    belül, a kör és a panel a helyén marad. Ez elfogadható: a kör nem tűnik el.
- **D27 — Gép: Apple Silicon, arm64.** Node 24 LTS natív .pkg-ből. Lásd `setup-macos.md`.
- **D38 — Az atmoszférikus preset geometriája**: kör alakú (14 szögpont) blob,
  `r = 0.34`, a középtől `0.28`-ra kitolva a base hue irányába. Tehát tartalmazza a
  semleges pontot, és `0.62`-ig ér ki.
  - **Miért ez**: az F4 megnevezi, de a spec nem definiálta, és a nevéből — a másik
    hárommal ellentétben — nem következik. Két alternatíva kiesett, mert nem ad új
    képességet: az „alacsony külső rádiuszra vágott szűk analóg ék" előáll az Analogous
    presetből a size csúszkával, az „alacsony rádiuszú széles sáv" pedig közelítőleg egy
    kis, középre húzott diszk, azaz ugyancsak a size csúszka.
  - **A kitolás a lényeg**: a rotálás és a skálázás egyaránt a *közép* körül történik
    (F5), tehát minden más mask középre szimmetrikus marad — egy **nem középre**
    helyezett maskot a meglévő kontrollok egyik kombinációja sem tud előállítani. Ez az
    egyetlen valóban új alak a három közül, és pont azt írja le, amit a légköri távlat
    tesz: minden tompul és egy hue felé húz.
  - **Mellékhatás, kívánatos**: ennél a presetnél a két csúszka önálló jelentést kap —
    a rotate a „légkör hue-ja", a size a „mennyire párás".
- **D39 — Mintavételi minimum-osztás**: a rácsméret-keresés nem megy `0.015` wheel-egység
  alá (`MIN_PITCH`).
  - **Miért kell**: nélküle a rácsméret korlátlanul alkalmazkodik a mask méretéhez, tehát
    a mask zsugorítása csak finomítja a rácsot, és N mindig elfér. A D25 ennek az
    ellenkezőjét feltételezi, és a szándéka nem érvényesült: egy `r = 0.002` mask is 12
    mintát adott, ami 12 megkülönböztethetetlen szürke.
  - **Miért `0.015`**: mérve. Radiálisan `0.015`-öt lépve az sRGB kimenet ~3/255-tel
    változik, a semleges közép környékén — a legsimább tartományban, ahol egy pici mask
    él — pontosan 3-mal. Ez alatt a minták a koordinátájukon kívül duplikátumok.
  - **Hatása**: `r < ~0.05` alatt kezd fogni. `r = 0.06` → 8 minta, `r = 0.02` → 2,
    `r = 0.01` → 1, és minden minta eltérő hex. Normál méretű maskot nem érint: mind a
    négy preset N = 12-re és N = 32-re is pontosan annyit ad.
  - **Amit nem állít**: a közép közelében két minta akármilyen távol is közel-szürke; ezt
    osztás-szabály nem javítja. A padló azt akadályozza meg, hogy a mintavevő több színt
    jelentsen, mint amennyit a terület tartalmazni tud — pontosan a D25 lényege.

---

## 5. Visszavont döntések (ne kerüljenek vissza)

| # | Mi volt | Miért esett ki |
|---|---|---|
| D1 | „Minden számítás OkLCh-ban" | A scope zsugorodása után túlkomplikálta a kört. Csak az interpoláció maradt Oklabban (D35). |
| D2 | L-független mask prizma | Tárgytalan, mert nincs L tengely (D16). |
| D15 | `L` = az in-gamut L-intervallum közepe | Gamut-keresést igényelt; a perem így is a telített sRGB szín, keresés nélkül. |
| D19 | Futásidejű cusp-tábla hue-nként | Ugyanaz: nem kell, a perem közvetlenül adódik. |
| D20 | Rádiusz = absztolút chroma, kerek diszk + elérhetetlen sáv | A YURMBY-szögosztás után nem következetesség, csak gépezet. Rádiusz most hue-nként normalizált. |
| D11 | „Nincs festék-adatbázis és festék-illesztés, sem később" | Új követelmény érkezett; a szerző újranyitotta. Lásd D40. A „sem később" innentől nem áll. |
| D13 | „Nincs export v1-ben" | Részlegesen visszavonva: PDF-lap export van (D43). A vágólapra másolás megmaradt. PNG/JSON export továbbra sincs. |
| D29 | Szabálytalan cusp-kontúr kirajzolása | Nincs szabálytalan perem, a diszk kerek. |
| D31 | Kétféle „nem elérhető" jelölés | Csak egy van: maskon kívül (D28). |
| D33 | OkLCh anchor hue-k közti monoton interpoláció | Összeomlik identitásra: a YURMBY-szög maga az sRGB hue. |
| — | Kép-input, export, value-ramp | Felhasználói scope-döntések, lásd D12, D13, D16. (A festék-illesztés visszatért: D40.) |

---

## 6. Stack

- **Vite + TypeScript** — egy dep-fa, `npm run dev`, nulla konfig.
- **React** — a felhasználó gyenge pontja a frontend; ehhez van a legtöbb
  magyarázható modell. Elvetett: vanilla TS canvas.
- **Nulla runtime dep** a Reacten kívül. Az Oklab konverzió saját, ~30 sor (D32, D37).
- **plain CSS + custom properties** — a szürkék pontos értéke funkcionális.
- **ESLint** — a Vite scaffold hozza, dev-only. Nem volt tervezett tétel, de nem árt.
- **vitest** — a színmatekra: Oklab round-trip, chroma-redukció helyessége,
  point-in-polygon, mintavételezés determinizmusa. UI-teszt nincs.

Nincs: culori, zustand, Tailwind, router, Next, komponens-könyvtár, CI, backend.

### UI irány
Mérőműszer, nem landing page. Egyetlen bold elem: a színkör. Minden más semleges
szürke, a kör körül nagyobb semleges zóna, hogy a környező színek ne rontsák el a
megítélést. Nincs színes akcent, gradiens, kártyásítás.

Layout (**0.12-ben módosítva, lásd D41**): kör balra, mask-panel középen (4 preset +
rotate/size/colors csúszka), színlista **jobbra**, mind a három egyetlen viewport-ban,
lapszintű scroll nélkül. A lista `auto-fill` gridben, nem fix 4 oszlopban.

---

## 7. Nem cél

- Value/L tengely, value-létra, ramp
- Keverés-szimuláció (a festék-illesztés már **nem** nem-cél, lásd D40)
- Kép-input bármilyen formában
- PNG / text / JSON export (a **PDF-lap** viszont van, D43)
- Fiókok, cloud sync, megosztható link
- Mobil layout
- Munsell renotation, CMYK, nyomdai színkezelés
- 3D gamut-test néző, több projekt kezelése

Későbbi jelölt: állapot mentése/betöltése.

---

## 8. Setup

Apple Silicon, arm64. Node 24 LTS natív .pkg-ből, Homebrew és Xcode CLT nélkül.
Ellenőrzőparancsokkal tűzdelt lépéssor: **`setup-macos.md`**. Git később, külön
lépésben: `.gitignore` először, aztán kis logikus commitok.

---

## 9. Changelog

- 0.1 — első vázlat: v1 scope, D1–D10, stack.
- 0.2 — scope-vágás: festék-illesztés, kép-input, export kiesik (D11–D13).
- 0.3 — value tengely kiesik (D16); a kör max-chroma cusp-felület lett.
- 0.4 — absztolút chroma rádiusz, piros-fent/CW, szabad polygon v1-ben (D20–D25).
- 0.5 — angol UI (D26), arm64 + Node 24 LTS (D27).
- 0.6 — mockup nyomán: mask-on-kívül tompítás (D28), cusp-kontúr (D29).
- 0.7 — kerek diszk elérhetetlen sávval, in-gamut L-intervallum szabály (D15, D30–D32).
- 0.8 — YURMBY szögleképezés, hat anchor kirajzolva (D33, D34).
- 0.9 — **egyszerűsítés**: a cusp-keresés, az elérhetetlen sáv és az L-intervallum
  szabály kiesett (D15, D19, D20, D29, D31, D33 visszavonva). A kör modellje most
  D35: YURMBY-szög, telített sRGB perem, normalizált rádiusz, Oklab-interpolált
  átmenet. `culori` elhagyva, nulla runtime dep (D37). Lista-tartalom rögzítve (D36).
- 0.10 — **implementáció**: v1 kész. Három nyitott kérdés eldöntve: az atmoszférikus
  preset geometriája (D38), a mintavételi minimum-osztás a D25 érvényre juttatásához
  (D39), és a D35 „kifelé telítettebb" állításának pontosítása mérés alapján. A
  `docs/implementation-plan.md` sorolja azt az öt pontot, ahol az implementáció
  ellentmondott a tervnek vagy a specnek.
- 0.11 — **festék-illesztés (D40)**, a D11 visszavonva. 647 AK festék kinyerve az
  AK_Catalogue2026.pdf-ből (két lapformátum: vektoros swatch az ekvivalencia-táblákban,
  raszteres a Real Colors rácsokon). Minta-lista wedge-enként csoportosítva.
- 0.12 — **egy-viewportos layout (D41)**: a színlista a kör mellé került, lapszintű
  scroll nincs. 1280×720 és 1512×860 mellett is elfér, csonkolás nélkül.
- 0.13 — **mask mozgatása húzással (D42)**: `offset` skalár az állapotban, a rotáció és a
  méret előtt alkalmazva; a diszkre clampelve; a húzás abszolút.
- 0.14 — **PDF-lap export (D43)**, a D13 részlegesen visszavonva. Saját PDF-író, nulla
  dependency; a lap pypdf-fel strict módban validálva és renderelve ellenőrizve.
  Mellékhatásként 35 elrontott festéknév javítva a katalógus-kinyerésben.
- 0.15 — **második gyártó (D44)**: 650 Vallejo szín, brandenként külön illesztés. A PDF-író
  többoldalassá tett, mert két brand sorával 32 színnél a tartalom nem fér egy lapra.
- 0.16 — **JPEG-lap export (D45)**: közös layout a PDF-fel egy `Surface` absztrakción át.
  A panel tömörítve, hogy a második export-gomb után a D10-es caveat 1280×720-on is
  látszódjon.
