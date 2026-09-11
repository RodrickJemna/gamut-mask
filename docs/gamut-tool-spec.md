# Gamut Mask Tool — spec

Verzió: 0.37
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
| F6 | A maskon belüli színek listája: swatch + hex + világosság + telítettség | a mask geometriájából (D47), nincs N csúszka |
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
  - **Amit pontosan megkötünk (0.21-ben tisztázva)**: a **kirajzolt** vertex marad a
    diszken belül, nem a *tárolt* koordináta. A base-polygon belső reprezentáció, és
    kimehet a diszken túl.
  - **A clamp egyszer fut, a pipeline végén.** A `rotate` / `scale` / `translate`
    primitívek tiszták, nem clampelnek. Korábban mindhárom clampelt, azzal az érveléssel,
    hogy „a D22 minden transzformációra áll" — ez összetett pipeline-ban hibás: egy
    *köztes* eredmény clampelése információt dob el, amire a későbbi lépéseknek szüksége
    van.
  - **Javított hiba (0.21)**: a `toBasePoint` a *base* pontot clampelte a diszkre, így egy
    vertex elérhető tartománya egy `size` rádiuszú, az `offset` körüli diszk lett, nem a
    körlap. Mérve: 50%-os méretnél egy vertex csak a kör feléig húzható, 30%-nál a
    harmadáig, és elmozgatott maszkkal aszimmetrikusan — az egyik irányban 0.10-ig. Egy
    háromszög „átfordítása" tehát nem volt lehetséges. Most a **display** pontot
    clampeljük, mielőtt visszaképezzük, és a vertex bárhová húzható a körlapon,
    bármilyen méret / offset / rotáció mellett.
- **D23 — Presetek rádiusz-arányban definiálva.** Preset betöltése felülírja az
  aktuális polygont, megerősítés nélkül.
- **D24 — Nem-konvex polygon engedve**, even-odd szabállyal. Önátmetszés nincs tiltva.
- **D17 — Determinisztikus mintavételezés, szög szerint rendezve.** Random mintavétel a
  mask minden mozgatásánál újravillogó listát adna. A *mechanizmus* a 0.19-ben lecserélve
  (lásd D47): a rács + bináris rácsméret-keresés + Lloyd-iterációk kiestek, helyettük a
  mask geometriája adja a mintákat. A determinizmus és a szög szerinti rendezés áll; az
  N (default 12, range 4–32) tárgytalan.
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
- **D56 — Hover-magyarázat minden kontrollon.** A natív `title` helyett saját tooltip.
  - **Miért nem a `title`**: kb. egy másodperc késéssel jön, nem stílusozható, és a
    többsoros szöveget csonkolja. Ilyen sűrű panelen épp a késés a baj: azért mutat rá az
    ember az „S 41%"-ra, hogy megtudja, mit jelent, nem azért, hogy várjon.
  - **Data-attribútumokkal, dokumentum-szinten figyelve**, tehát semmit nem kell a
    komponens-fán átvezetni: bármelyik elem beszáll a `data-hint`-tel (cím) és a
    `data-hint-body`-val. A legközelebbi ilyen felmenő nyer, tehát egy gomb belső canvasa
    vagy spanja magától örökli a tulajdonosáét. Az alternatíva — context plusz egy prop
    minden kontrollon — sok vízvezeték egy tooltipért, és az a fajta, ami félig marad.
  - **A cél elemhez pozicionálva, nem a kurzorhoz**: így nem ugrál, ahogy az egér a
    kártyán belül mozog, és **fókuszra is** megjeleníthető, ahol egyáltalán nincs
    kurzorpozíció. A viewport széléhez vágva, és ha alul nem fér, fölé kerül.
  - **Mit magyaráz.** A preset-ikonok a séma nevét és hogy **mire jó** — a jellemzéseket
    ott, ahol Gurney ad ilyet, **az ő szavaival**, mert ezek dokumentált hangulatú, nevesített
    sémák, és „élénk és modern"-re átfogalmazva épp az az egy rész veszne el, amit a
    festő nem tud leolvasni a körről. A színkártyák azt, **mit jelentenek a számok** — és
    kiemelten azt, hogy az `S` a kör **hue-nként normalizált** rádiusza, nem absztolút
    chroma, mert pont ez tette önkényesnek a 60-30-10 szerepsorrendjét, amikor a szerző
    ellenőrizte. A festék `range`-e is ide került: a kártyán nincs rá hely, viszont ez
    mondja meg, melyik termékvonalat kell megvenni (a Model Air és a Model Color nem
    ugyanaz ecset alatt).
  - **Átmeneti overlay, tehát lehet kerete és kiemelt háttere**, amit a 6. pont a
    *layoutra* kizár: ez nem egy kártya, ami a figyelemért versenyez, hanem az, amire
    rámutattál, és visszabeszél. `pointer-events: none`, különben a tipp a kurzor alá
    kerülhet és elrejtheti a saját célját.
- **D55 — Hat preset, ikonos rácsban.** A négy szöveges, egymás alatti gomb helyett hat
  ikon 3×2-es rácsban.
  - **Az ikon a preset saját kontúrja**, a `buildPreset` geometriájából rajzolva, nem
    kézzel — ugyanaz a fegyelem, mint a kör-chipeknél (`renderDisk`) és a PDF-nél: egy
    ikon nem tud eltérni attól a formától, amit betölt. A `viewBox` maga a kör-tér, mint a
    MaskOverlay-ben, tehát a polygon koordinátái leképezés nélkül mennek bele.
  - **Miért ikon**: hat szöveges gomb hat teljes szélességű sor lenne; ikonként kettő. És
    az ikon a jobb címke: a **forma az, amit választunk**, a „Split complementary" pedig
    eleve nem férte ki a panel szélességét. A név a tooltipben és az `aria-label`-ben van,
    tehát semmit nem csak a kép közöl. Magasság: 129 px hatra, szemben a négy szöveges
    gomb ~124 px-ével.
  - **Két új forma, mindkettő a szakirodalomból.**
    - **Complementary** — hosszú rombusz a körön át, szemközti hue-kkal. Gurney ezt és a
      félrehúzott háromszöget nevezi meg *a két kipróbálandó* alakként; a jellege
      „elemi ellentét, tűz és jég", és „meglehetősen stabil, mert a saját semlegese
      egybeesik a kör közepével". Ez volt az egyetlen hiányzó Gurney-séma, amit a maskunk
      egy polygonnal ki tud fejezni (a „Mood and accent" két szétvált régiót kíván).
    - **Rectangle** — két komplementer pár, mert egy **középre tett téglalap
      szükségszerűen az**: a szemközti csúcsok átellenes hue-k. Fél-kiterjedésekből épül,
      nem négy hue-szögből, mert *ez* garantálja, hogy valóban téglalap: négy polárpont
      csak akkor ad téglalapot, ha a rádiuszokat hozzáigazítjuk, és az ottani kerekítés
      látható ferdeségként jelenne meg. Szélesebb, mint magas, tehát nem négyzet: a hosszú
      tengely adja a domináns ellentétet, a rövid a másodlagosat.
  - **Mérve, betöltés után**: a Complementary 10 színt ad, legjobb 60-30-10 egyensúly
    **1.04**; a Rectangle **15 színt** — a legtöbbet az összes preset közül — és **1.00**-t.
    Mindkettő tartalmazza a semlegest.
  - **A `PRESETS` lista a rács olvasási sorrendje**, és minden tétel `hint`-et is hord (a
    tooltip szövegét). A `presets.test.ts` `ALL` listája innentől **a `PRESETS`-ből
    származik**: korábban négy elem volt beírva, tehát az új formák kimaradtak volna
    minden invariáns-ellenőrzésből.
- **D54 — 60-30-10 paletták a mask színeiből, a lap alján.** Legalább három javaslat
  maskonként, mindegyik egy arányos sávként.
  - **Mi tudomány és mi nem.** A 60-30-10 maga **tervezői ökölszabály**, nem
    látástudományi eredmény. Ami viszont kimondott, több mint százéves elv: **Munsell
    egyensúlya** — „minél erősebb a szín, annál kisebb legyen a területe; minél nagyobb a
    terület, annál szürkébb a chroma", és a szín a **középszürkén** egyensúlyoz. Munsell
    számszerűvé is tette: egy szín erőssége a **value × chroma** szorzata, a területek
    pedig **fordítottan** aránylanak ehhez:

        A1 / A2 = (V2 · C2) / (V1 · C1),   azaz   A · V · C állandó

    Két saját munkapéldája fixálja a formulát: R7/6 (7×6=42) az R3/3-mal (3×3=9)
    **9 : 42** arányban egyensúlyoz; a Blue 4/5 (20) és a Yellow-Red 6/7 (42) pedig
    **42 : 20** arányban.
  - **Ezért a 60-30-10 ellenőrizhetővé válik.** Ha a területek 0.6 / 0.3 / 0.1, akkor —
    mivel A·V·C egyenlő — az erősségeknek **1 : 2 : 6** arányban kell állniuk: az akcentus
    hatszor olyan erős, mint a domináns, a másodlagos kétszer. **A szerepek tehát nem
    stílusdöntés, hanem a területekből következnek**: a domináns mindig a leghalványabb
    szín, az akcentus a legerősebb.
  - **Ahol közelítünk**: Munsell value/chroma külön skálák, mi Oklab világosságot és
    chromát használunk, mert a kör abban van felépítve (D35) és mert a Munsell-renotáció
    kifejezett nem-cél (7. pont). Az **arányokat a mértékegység nem érinti** (mindkét
    tengely konstansszoros átskálázása minden erősséget ugyanannyival szoroz, és kiesik),
    de a két világosság-skála közti nemlinearitás igen. A `balance` tehát **relatív
    rendezés, nem Munsell-mérés.**
  - **A szürke ingyen van**, és ez hűség, nem kibúvó: chroma nélkül nincs erősség, tehát
    egy semleges nem tud kiegyensúlyozatlanná tenni semmit — ő az a pont, amin a többi
    egyensúlyoz. Bármekkora területet elbír, és a pontszám csak a kromatikus tagokat
    kötözi. Pontosan így működik egy nagy tompa alapszín két kromatikus akcentussal.
  - **AZ ERŐSSÉG EGYMAGÁBAN NEM ELÉG** (0.35-ben javítva). Az első implementáció csak
    nagyságokat pontozott, tehát semmit nem mondott arról, **hol** vannak a színek a körön:
    „egy zöld 60%-on és egy másik zöld 30%-on" ugyanolyan jó pontot kapott, mint zöld a
    vörössel. Három ciánt, vagy két zöldet és egy ciánt választott, a gamut felét
    kihasználatlanul hagyva. Munsell viszont **irányról** beszél: „egy ragyogó pont erős
    vörösből kiegyensúlyoz egy nagyobb foltot a legszürkébb **kékeszöldből**".
    - Ezért a szín ereje **vektor**: value × chroma a hue irányába, ami Oklabban simán
      `L · (a, b)`, és a paletta akkor egyensúlyos, ha a **területtel súlyozott összeg a
      semlegesre esik**. Ez az egy feltétel mindkét felét tartalmazza a szabálynak: két
      színnél `w1·m1 = −w2·m2` egyszerre írja elő a területek fordított arányát **és** a
      hue-k szembenállását. Szigorúan hűbb, mint a nagyság-teszt, amit leváltott.
    - **MINDKÉT FÉL KELL** (0.36-ban javítva). Három területre a tökéletes egyensúly egy
      geometriai állítás: a súlyozott momentumok `w_i · m_i` **egyenlő hosszúak ÉS nulla
      összegűek** — egyenlő oldalú háromszöget zárnak. Az egyenlő hossz a fordított
      terület-szabály (1 : 2 : 6 erősség a 0.6 : 0.3 : 0.1 területekhez), a nulla összeg a
      „középszürkén egyensúlyoz". Két színnél az irány-feltétel magában kikényszeríti a
      nagyságot is, **háromnál viszont nem**: az irányoknak elég szabadsága van kioltani
      egymást úgy is, hogy a területek rosszak az erősségekhez. Így került be egy séma,
      ahol az akcentus **7%-kal** volt erősebb a másodlagosnál, és mégis a terület
      harmadát kapta — olyan akcentus, ami nem akcentus. (A szerző szúrta ki: a listában
      mindkettő „S 41%"-ot írt.)
    - **Két reziduum, tuning-konstans nélkül**: `direction = |Σ w·m| / Σ |w·m|` és
      `magnitude = (max−min)/(max+min)` a kromatikus tagok súlyozott hosszain. A kiírt szám
      a kettő hipotenúzája √2-vel normálva (`off %`), a két fél a tooltipben — mert
      **másképp hibásak**, és a különbség tettre fogható: nagy `direction` = a hue-k nem
      állnak szemben, nagy `magnitude` = egy alig erősebb szín kapott háromszoros
      területet.
    - Mérve: a csak nagyságot néző pontozás 60–98% irány-hibát adott; a csak irányt néző
      56%-os nagyság-hibát; a kettő együtt a legrosszabb nagyság-hibát **21%**-ra hozta, és
      a preseteken az akcentus **~3×** erősebb a másodlagosnál, ami épp a 0.3/0.1 arány.
    - **Az `S` oszlop nem ez.** A lista `S`-e a kör **hue-nként normalizált** rádiusza
      (D20/D35), a szerepsorrend viszont absztolút chromán áll. Két szín olvashat „S 41%"-ot
      és negyeddel eltérő chromájú lehet — a kék peremének chromája 0.313, a vörösének
      0.258 —, ezért a szakasz tooltipje kiírja az erősséget `L × chroma` felbontásban:
      nélküle a sorrend épp akkor tűnik önkényesnek, amikor valaki ellenőrzi.
  - **Három különböző hue-család, ahol a mask engedi.** Egy kiegyensúlyozott paletta is
    duplázhat — két sárga, amelyek együtt kiegyenlítenek egy magentát, pontosan
    egyensúlyos, és mégis négy szeletet hagy ki —, ami tévedésnek olvasódik, akkor is, ha
    az aritmetika helyes. A preferencia **mérve majdnem ingyen van**: három családot
    megkövetelni 0–2 pont biast kerül a preseteken. A semleges a saját családja, mert nem
    „még egy" semmiből.
  - **Szűk gamut nem tud egyensúlyozni, és ezt kimondja.** Egy analóg mask minden színe
    kb. ugyanarra húz, tehát semmilyen súlyozás nem oltja ki őket: a legjobb sémái **94%**
    felett vannak. Ez a sémáról igaz, nem a kereső hibája — egy analóg gamut szándékosan
    egyoldalú, épp ezért választja az ember.
  - **A változatosság szakaszosan lazul**, nem éhezik el: az első kör külön akcentust ÉS
    külön dominánst kér (így három *ötlet* jön ki, nem egy ötlet három helyettesítéssel),
    a második csak külön akcentust, a harmadik bármit. Négy színű mask így hármat ad;
    háromszínű egyet, mert háromból hármat egyféleképpen lehet választani.
  - **Kevés színnél nem hazudik**: a pasztell körön egy szűk mask a D47 0.05-os
    szeparációja után **két** színre olvad, és kettőből nem lesz háromrészes paletta — a
    UI ezt kiírja, nem tölti fel ismétlésekkel.
  - **A lap alján, teljes szélességben**, saját grid-sorban (`auto` magasság, a felső sor
    `minmax(0,1fr)`), tehát a csík annyit kér, amennyi a tartalma, és nem szűkíti a kört
    ok nélkül. A hover a D46-ot használja újra: a szakasz fölé érve ugyanaz a szín
    gyűrűződik a körön, mint a listasor fölé érve.
  - **A címkék NEM a szakaszokhoz igazodnak.** Igazodtak, és jól is olvasódott, amíg ki
    nem derült, hogy a 10%-os cella 1024-en 31 px, 1280-on 40 px — egyikbe sem fér bele egy
    hex, tehát minden akcentus kódja csonkolódott. Az arányokat a sáv hordozza; a
    címkesor csak olvasható legyen.
  - **A mask-használati súgó a kör alá költözött** (a caveat mellé), és ez az, ami helyet
    adott ennek a sornak: nélküle a kontrollpanel 92 px-szel túlfolyt 1280×720-on.
  - **Rajta van az exportált lapon is** (0.34-től): a lap az, ami a festőasztalra kerül, és
    épp azt nem lehet swatchek listájából visszafejteni, hogy az alábbi színek közül
    **melyik a 60% és melyik a 10%**. Arányos sáv + szerepenként egy sor (részarány, hex,
    és a hozzá illő festék), nem a szakaszok alá igazított címkék: a lapon a sáv 200 pt, a
    10%-os szakasza tehát 20 pt — ugyanaz az ok, amiért a képernyőn sem igazítottuk.
    A `layoutSheet` közös, tehát a PDF és a JPEG együtt kapta meg.
- **D53 — Váltható színkörök (négy változat, azonos geometria).** A kör eddig egy volt;
  most négy, és a választó a panel tetején van.
  - **Egy kör = egy KÖZÉP és egy PEREM.** A `sample` Oklabban interpolál a kettő között,
    majd chromát redukál — tehát egy változat két érték cseréje, és minden, ami lejjebb
    van (polygon, mintavevő, illesztő, exportok), érzéketlen arra, melyik van használatban.
  - **A négy változat**: `saturated` (a régi), `pastel` (tintek), `muted` (tónusok),
    `shadow` (árnyékok).
  - **Mind megtartja a SZÖGKONVENCIÓT**, és ez az, ami olcsóvá teszi: a hat anchor 60°-on
    marad, tehát az R Y G C B M betűk, a színlista ék-fejlécei és a Snap 60° lépés
    továbbra is helyesek — és **egy maskot átvihetsz** a körök között, mert ugyanazt
    jelenti mindegyiken. A `setWheel` ezért **nem nyúl** a maskhoz, a rotációhoz és a
    mérethez. Egy másik szögbeosztású kör (RYB, vagy perceptuálisan osztott hue-k)
    elmozdítaná az anchorokat, és külön munka.
  - **Nem tér vissza a value-tengely (D16)**: minden változat továbbra is pontosan egy
    szín (szög, rádiusz)-onként. A kör kiválasztása egy *felületet* választ, nem ad
    dimenziót; nincs ramp, nincs létra, nincs mit végigscrubolni.
  - **A konstansok mérésből jönnek**, festék-elérhetőség szerint (ugyanaz a mennyiség,
    amit a D50 fátyla árnyékol): `saturated` 60.1%, `pastel` 72.6%, `muted` **97.4%**,
    `shadow` 95.3%. Élőben, a triádon: a muted **9/9** mintát illeszt, a pastel 5/7, a
    régi kör 11/13.
    - **A muted a praktikus.** Majdnem minden színe megvásárolható, és a D50 fátyla
      csaknem üres rajta.
    - **A pastel a leggyengébb** a háromból, nem a legszelídebb: a katalogizált festékek
      közül csak 114 van L 0.85 felett, a mediánjuk 0.53. Az elérhetőséget a **chroma**
      hajtja, nem a világosság — *több* fehér a perem felé javítja (0.25 → 62.8%,
      0.55 → 78.7%), a közép világosítása rontja (L 0.70 → 78.7%, L 0.90 → 72.7%).
  - **A minták száma csökkenhet**: a D47 0.05-os szeparációja a kisebb chromájú körökön
    több jelöltet olvaszt össze (triád: 13 → 9 → 7). Ez helyes — a szeparáció *pont* a
    festék-illesztés toleranciája —, de azt jelenti, hogy egy pasztell körön kevesebb
    **megkülönböztethető** szín van, nem azt, hogy elveszett valami.
  - **Az állapotban él** (`wheel: WheelId`), nem nézeti beállításként: megváltoztatja,
    *mi* minden szín a listában, mire illeszt a matcher és mit mond mindkét export —
    tehát pont az, amit egy mentett fájlnak hordoznia kell (D18). A visszavonásban egy
    lépés.
  - **A D50 mezői körönként cache-elődnek** (`wheel|brand`), mert a kérdés az, hogy
    „elér-e ide festék", és a korong más felület minden körön.
  - **A kép-előállító függvényekben a kör KÖTELEZŐ paraméter.** Volt default értéke, és a
    `jpeg.ts` azonnal el is felejtette átadni: a szaturált korongot rajzolta egy olyan
    lapra, aminek a színei másik körről jöttek, és semmi nem jelezte. Az olyan default,
    ami csendben hibás lehet, rosszabb, mint egy argumentum.
  - **A D10-es caveat a kör alá költözött.** A kontrollpanel alján az volt, ami lelökődik
    1280×720-on, valahányszor bármi nő fölötte — és háromszor meg is történt (D50,
    negyedik gyártó, most a kör-chipek). A kör négyzet egy magasabb kolumnában, tehát ott
    van **146 px** szabad hely, a panelen nulla. Odaillik is jobban: a caveat arról szól,
    mit jelent a **korong**.
- **D52 — Negyedik gyártó: Citadel (Games Workshop).** 105 szín, `src/paints/citadel.ts`,
  a „Citadel Painting System" plakátból. A `BRANDS` bővítése ismét elég volt; a sor
  magassága (`ENTRY_H`) magától nőtt négy sorra.
  - **A forrás nem katalógus, hanem recept-táblázat**: soronként „alapozó, majd ezek a
    rétegek, majd ezek a szárazecsetelések". Ebből következik, hogy **csak azok a
    festékek szerepelnek, amiket a GW ezekben a receptekben használ**, nem a teljes
    Citadel paletta.
  - **Nincs benne semmilyen szövegréteg**: egyetlen 1198×4468-as JPEG, a pdfplumber nulla
    karaktert lát. A neveket **optikailag** kell kiolvasni — ez az egyetlen extractor,
    ami OCR-t használ. A macOS **Vision** keretrendszer csinálja
    (`scripts/ocr-vision.swift`), mert a rendszer Pythonja 3.9, amivel a modern pyobjc nem
    fordul, és mert így nem kell Tesseractot telepíteni egy hobbiprojekthez.
  - **Cellánként kell OCR-ezni**, nem egyben az oldalt: 1198 px szélességen a cellaszöveg
    olyan kicsi, hogy a Vision csonkol („WHITE SCAP", „CASANDOR!"). A kivágott cella 4×
    felnagyítva megy be, és ez egyben meg is oldja a szöveg–cella párosítást.
  - **Nincsenek termékkódok.** A Citadel festékeket a nevük azonosítja, ezért a `ref`
    **maga a név**, a `name` pedig üres — különben a UI minden sorban kétszer írná ki
    ugyanazt. A `Paint.name` innentől lehet üres; teszt köti, hogy pontosan a Citadelnél
    az és sehol máshol.
  - **A színek a cella móduszából**, ugyanúgy, mint a Pro Acrylnál és ugyanazért: a név rá
    van nyomtatva a swatchre. A festékek **ismétlődnek** a sorok között (a DAWNSTONE négy
    cellában szerepel), és ez ingyen ellenőrzés: a megtartott 105 szín **mindegyike
    minden előfordulásában azonos értéket adott**.
  - **A shade-ek maguktól estek ki.** A wash-cellákat **átmenettel** rajzolják (fehérbe
    fut ki, jelezve az áttetszőséget), így a módusz-arányuk összeomlik — pontosan úgy,
    ahogy a Pro Acryl 1-Step swatcheké. A `MIN_FLAT_SHARE` így **pontosan a GW tizenkét
    shade-jét** dobta ki (Agrax Earthshade, Nuln Oil, Reikland Fleshshade, …) **névlista
    nélkül**, tisztán a bizonyíték alapján. A metálok, glaze-ek, technical és texture
    termékek a fő rács alatt vannak, azokat pozíció szerint hagyjuk ki.
  - **A plakát nem színhelyes katalógus**: két festékpár azonos swatch-színnel szerepel
    rajta (Flash Gitz Yellow = Hexos Palesun, Praxeti White = White Scar). Ez a forrás
    pontatlansága, nem a kinyerésé — ellenőrizve a cellák képén. Az illesztő ilyenkor a
    korábbi katalógus-bejegyzést adja vissza, ami stabil és dokumentált viselkedés.
  - **Mit ad hozzá**: területi fedés 59.7% → **60.2%**, önmagában 33.6%. A négy preseten a
    minták **11%-ánál** a Citadel a legközelebbi tégely; új találat nulla.
- **D51 — Harmadik gyártó: Monument Hobbies Pro Acryl.** 138 szín, `src/paints/proacryl.ts`,
  a „Set List.pdf"-ből kinyerve. A `BRANDS` lista bővítése plusz egy adatmodul; a
  gyártó-szűrő (D48), az elérhetőségi mező (D50) és a lap sormagassága mind a `BRANDS`-ből
  származik, tehát maguktól követték.
  - **A kinyerés három csapdája**, mindegyik dokumentálva a scriptben: (1) a PDF minden
    glifát **kétszer** rajzol (így fake-bold), ezért „BBoolldd" — a dedupe tolerancia
    **mért**: az azonos glifák 92%-a 0.05 pt-en belül van, utána ~89 pt-re ugrik a
    következő. (2) Néhány tile a szöveget **kétszer, két elrendezésben** hordozza, a
    két réteg legközelebb 0.442 pt-re van egymástól, ezért a név-sorcsoportosítás
    toleranciája 0.1. (3) A tile saját fill-je **fehér**, nem a festék színe.
  - **A szín raszterizált lapról, MÓDUSSZAL**: a swatch egy **kör fekete háttéren**, a név
    és a kód **rá van írva** fehérrel, tehát nincs tiszta téglalap. A beírt körlap
    leggyakoribb színe a festék (a mediánja 72%-a a pixeleknek), a felirat pedig
    szétszóródik antialiasolt szürkékbe. Validálva: a 010 Purple deklarált
    (0.494, 0.31, 0.486) fillje **#7e4f7c**-ként jött vissza, nulla csatornahibával.
    A tile-ok egymásra rétegzettsége ingyen konzisztencia-ellenőrzés: 176 duplikált kód
    közül 175 pontosan egyezik, a maradék egyet 2:1-re leszavazza a **többség**.
  - **Kizárva**: metálok (halmaz és név szerint is), transzparensek és washok — lapos
    swatch félrevezet, ugyanaz az ítélet, mint az AK-nál és a Vallejónál. **Az 1-Step
    szettek is**, és ez **mért** kizárás: a swatch-üket gradienssel rajzolják, így a
    módusz a fehér feliratra esik (a körlap 2–6%-a, szemben a máshol mért 72%-kal). A
    `MIN_FLAT_SHARE` alatti swatch pontosan azt a 24 festéket dobja ki és semmi mást —
    és el fogja kapni a következő gradiens swatch-ot is, ahelyett hogy csendben olyan
    színre redukálná, amilyen nincs neki.
  - **Mit ad hozzá, őszintén**: a fedést alig. Területre vetítve 58.3% → **59.7%**, mert
    csak a korong **1.4%-át** éri el egyedül; 38.2%-on osztozik a másik kettővel. A 138
    festék önmagában viszont 39.6%-ot fed — hatékonyabb, mint az AK 647 festéke 47.3%-kal.
    Amit ad, az a **választék**: a négy preseten a minták **22%-ánál** a Pro Acryl a
    legközelebbi tégely. Olyan szín, aminek eddig nem volt találata és most van: **nulla**.
  - **A lap sormagassága (`ENTRY_H`) innentől számított**, `12 + 9 × BRANDS.length`. Fixen
    30 volt, ami pontosan két gyártóra volt igaz; a harmadikkal a sorok egymásra
    csúsztak volna — az a fajta hiba, ami addig lapul, amíg valaki el nem olvas egy
    kinyomtatott lapot.
- **D50 — Elérhetőségi visszajelzés: mit nem tud egyáltalán kiadni festék.**
  - **A probléma**: a festék-fedés se nem egyenletes, se nem kitalálható, tehát a maskot
    oda is lehet vinni, ahol a színei többségének nincs tégelye — és ez eddig csak
    utólag derült ki, a listából.
  - **Két olvasat, ugyanarra a kérdésre.** A körön egy **fátyol** árnyékolja, amit egyik
    engedélyezett gyártó sem közelít 5%-on belül (a mask elhelyezése **előtt**), a lista
    fejlécében pedig egy **számláló** mondja meg, hogy a jelenlegi mask hogyan járt
    („11 of 13 matched").
  - **Üres gyártó-szűrőnél mindkettő eltűnik**: nem kerestünk, tehát a „0 of 13" hamis
    állítás lenne, nem eredmény — ugyanaz a különbségtétel, mint a D48-nál.
  - **Távolság-mező, nem logikai maszk**: cellánként a legközelebbi festék távolsága
    tárolódik, és a küszöb **pixelenként** alkalmazódik, így a határ interpolálható és
    egy 1 fokos rács is sima élt ad, nem lépcsőt. A felbontást a mérés döntötte el: a
    teljes minimum mind az 1297 festékre egy 360×64-es rácson **34 ms** mindkét gyártóra,
    tehát nincs ok durvábbat tárolni vagy a munkát későbbre tolni.
  - **Gyártónként külön mező, olvasáskor kombinálva** (cellánkénti minimum): egy szín
    csak akkor elérhetetlen, ha **minden** engedélyezett gyártó elvéti, és egy harmadik
    katalógus így egy mezőbe kerül, nem 2^n kombináció újraszámolásába.
  - **A küszöb a `MATCH_TOLERANCE_PERCENT`-ből származik**, nem beírva, és teszt állítja,
    hogy a fátyol és a `matchingPaints` **minden rácspontban** egyetért. Az árnyékolt
    terület és a listában lévő szöveg ugyanaz a kérdés; a D40-nek már van sebhelye abból,
    amikor két ilyen olvasat elcsúszott.
  - **A fedés valódi száma**: a korong **területének** kb. 40%-a elérhetetlen mind a négy
    katalógussal együtt is (két gyártóval 42% volt, lásd D51, D52). Az implementációs jegyzetben szereplő 73.4% **cellánkénti**
    fedés egy egyenletes theta–t rácson, ami túlsúlyozza a közepet: egy t=0.05-es cella a
    huszadát fedi egy t=1-esnek. Területre vetítve a fedés ~58%.
  - **És nem „a perem"**: a vörös a peremig elérhető, a kék és a magenta viszont már
    t≈0.48 körül kifogy. Ez az, amiért a számláló egyedül nem elég — az alakzat nem
    kitalálható.
  - **Alfa 80/255, ránézésre választva**: 48 láthatatlan volt (a terület bizonyíthatóan
    ki volt rajzolva, mégsem lehetett kivenni), 110 a maskon kívüli fátyol (D28) súlyát
    érte el, ott a kettő megszűnik különbözni. A 80 olvasható és közben egyértelműen a
    világosabb.
  - **Nem az állapotban**: a be/kikapcsolás nézeti beállítás, `useState` az App-ban a
    `highlighted` mellett. **Alapból kikapcsolva** (0.26-ban módosítva): eredetileg
    bekapcsolva indult, azzal az érveléssel, hogy a limit a mask elhelyezése *előtt* a
    leghasznosabb, és hogy egy kikapcsolt funkciót senki nem talál meg. A szerző ítélete
    ránézésre az volt, hogy a korong 42%-át beborító fátyol csúnya — a számláló pedig
    kérés nélkül is jelenti a fedést, tehát kikapcsolva sem veszik el semmi.
  - **Az exportált lapra nem kerül rá** (D43/D45): a lap minta-soronként már kiírja a
    „No paint found"-ot, tehát ott a fátyol csak sötétítené a kis körképet.
- **D49 — Szerkesztési kényelem: visszavonás, kézi értékbevitel, szög-rasztolás, és
  festék-eltérés egy szóban.** Négy kis tétel, egy döntésbe fogva, mert mind ugyanazt a
  problémát célozza: a mask szerkeszthető, de a szerkesztés nem visszakövethető és nem
  reprodukálható.
  - **Visszavonás/újra (`state/history.ts`)**: a meglévő reducert körbefogó reducer, azt
    nem módosítja. Ötven lépés mélyen, `cmd-Z` / `cmd-shift-Z` / `ctrl-Y`, plusz két
    gomb a MASK fejlécsorában — a gyorsbillentyűt semmi más nem hirdeti.
    - **A nehéz kérdés az, hogy mi egy lépés.** Egy csúcs-húzás képkockánként küld
      `moveVertex`-et, egy csúszka pixelenként `setRotation`-t, tehát minden akció
      rögzítése azt jelentené, hogy a „visszavonás" egy gesztus egyetlen képkockáját
      tekeri vissza. Az akciók ezért három osztályba esnek: **diszkrét** (mindig új
      lépés), **összevonható** (egy futam egy kulccsal egy lépés) és **átmeneti**
      (`beginDrag`/`endDrag`, soha nem lépés — csak a `dragging`-et mozgatják).
    - Az összevonási kulcs **tartalmazza a csúcs indexét**, és az `endDrag` **törli** a
      kulcsot: e nélkül ugyanannak a csúcsnak két külön húzása egyetlen lépésbe folyt
      volna össze.
    - **Csak a csúszka-képkocka vonható össze.** A kulcs önmagában az akció típusából
      kevés volt: a beírt érték és a raszter-pipa is `setRotation`-t küld, tehát a 137
      fok beírása és a Snap bekapcsolása **egy** lépésbe olvadt, és egy visszavonás 120-ról
      a 137-et átlépve 0-ra ugrott. A csúszka `continuous`-t küld, és csak az olvad.
    - **Visszaálláskor a `dragging` törlődik**: egy gesztus közben rögzített lépés
      különben úgy jönne vissza, hogy egy csúcsot fogva tart.
  - **Kézi értékbevitel**: a rotáció és a méret számmezőt kap a csúszka mellé.
    - **Miért**: csúszkával nem lehet pontos értéket eltalálni, tehát egy sémát nem lehet
      felírni és visszaállítani. A „triád 120 fokon, 80%" így elég a reprodukcióhoz.
    - **Commit blur-re vagy Enterre**, nem leütésenként: a mező üres, amíg újraírják, és
      azt commitolni vagy elutasítást vagy egy default-ra ugrást jelentene.
    - **A mező nem vág le semmit.** A reducer már normalizálja a rotációt 360 szerint és
      vágja a méretet, tehát 400 fok beírása után 40 marad a mezőben — ott van a mask.
  - **Szög-rasztolás**: pipa a SHAPE fejlécsorában, a hat anchor-szögre (`WEDGE_SPAN`
    többszöröseire).
    - **A kibocsátott értéken raszterol, nem az input `step`-jén.** A `step` elszakítja a
      kontrollt az állapottól: 60-as step mellett a mezőbe írt 40 fok a 60-as jelölőnél
      rajzolja a csúszkát, mert a 40 az input szerint érvénytelen.
    - **Nem mágneses tolerancia** sem: az az anchorok melletti szögeket elérhetetlenné
      tenné. Húzva hat állás van; a pontos közti értékek a számmezőé.
    - **Bekapcsoláskor a jelenlegi szöget is raszterolja**, különben a csúszka és az
      állapot addig nem egyezik, amíg hozzá nem nyúlnak.
    - **Nem az állapotban él**, hanem komponens-állapotban: beviteli mód, nem a mask
      tulajdonsága, és a reducerben a `cmd-Z` egy jelölőnégyzetet kapcsolna vissza a
      forma helyett.
  - **Festék-eltérés egy szóban** (`driftLabel`): minden találat mellé egy szó arról,
    merre téved a tégely — `darker`, `lighter`, `greyer`, `stronger`, vagy semmi.
    - **Nem csak világosság**, pedig úgy kérték. 2401 körszínen és a 3110 toleranciába eső
      találatukon mérve a |dL| csak a találatok **46%-ában** a nagyobb a két eltérés
      közül: a chroma ugyanannyit mozog, tehát a világosság-only jelzés az esetek nagyobb
      felén hallgatna — és úgy hallgatna, hogy az „ez rendben van"-nak olvasódik. Ezért a
      **dominánsabb tengely** megy ki.
    - **A 0.02-es küszöb mért, nem választott**: a |dL| mediánja 0.011, maximuma 0.054,
      tehát 0.005-nél a jelzés a sorok 77%-án megjelenik és nem jelent semmit, 0.04-nél
      1%-án. 0.02-nél 47%-on szólal meg — világosság 19.5%, chroma 27.2%.
    - **Mindig csak egy szó**: a lista sávja már a színkörrel osztozik a szélességen. A
      tooltip mondja ki, mihez képest.
    - **Ez nem value-tengely (D16)**: két ismert színt hasonlít egymáshoz — egy konkrét
      tégely katalógus-swatchét a képernyőn látható színhez —, nem ad kontrollt és nem
      rendez semmit.
- **D48 — Gyártó-szűrő**: jelölőnégyzet gyártónként, hogy melyik katalógusra illesztünk.
  - **Miért**: több katalógussal a sorok száma mintánként nő, és a felhasználónak
    általában nem mind a hat gyártó tégelye kell. A szűrő a válasz a „túl sok találat"
    problémára, nem egy találat-limit.
  - **`BRANDS`-ből generált**: egy új katalógus hozzáadása magától kap jelölőnégyzetet,
    ehhez a UI-hoz nem kell hozzányúlni. Egy soros, sortörő elrendezés — a panelnak
    helyet kell hagynia a D10-es caveatnak, és ez a lista nőni fog, tehát a bővülés
    először szélességbe menjen, ne magasságba.
  - **Hol tárolódik**: `enabledBrands: Brand[]` az állapotban, **`BRANDS` sorrendben**
    tartva, nem kattintási sorrendben — különben a festéksorok átrendeződnének
    ki/bekapcsolásra. Az állapotban, mert megváltoztatja, mit mond a lista és mindkét
    export, és mert pont ez az, amit egy mentett fájlnak hordoznia kell (D18).
  - **Indulásnál csak az AK Interactive van bekapcsolva** (0.30-ban módosítva). Korábban
    mind, ami azt jelentette, hogy minden szín alatt négy festéksor állt, még mielőtt a
    szerző megmondta volna, milyen festéke van — 108 px magas kártyák és egy scrollozó
    lista, nagyrészt olyan tégelyekkel, amikhez nem tud hozzányúlni. Egy gyártó az
    őszinte default; a szűrő arra van, hogy a többit hozzáadja. Az AK azért, mert az a
    szerző polca. **Nem `BRANDS[0]`-ból származik**: hogy épp az első, az a katalógusok
    hozzáadási sorrendjének véletlenje, és az átrendezésük nem változtathatja meg
    csendben, mivel indul az app.
  - **Az üres szűrő engedve**, és azt jelenti, hogy „nincs festék-illesztés". Ez
    **szándékosan más**, mint a „kerestünk és nem találtunk": ilyenkor a UI **semmit**
    nem ír a festéksorba, nem „No paint found"-ot — az utóbbi hamis állítás lenne, mert
    nem is kerestünk. A `closestOverall` ezért `null`-t ad üres szűrőre.
  - **A szűrő paraméterként megy át** a `match.ts` függvényeibe, nem modul-szintű
    állapotból, tehát a függvények tiszták maradnak.
- **D47 — A minták a mask geometriájából, két gyűrűben**:
  - a **középpont**;
  - **külső gyűrű**: minden **csúcs** és minden **él felezőpontja**;
  - **belső gyűrű**: mindkettőnek a **közép felé vett félútja**.
  
  Egy triádnál ez tizenhárom szín: három hue a sarkokban (82% telítettség), három
  tompított keverék az élek felén és három félerős sarok (mind 41%), három félerős
  élkeverék (~21%), és a semleges. Azaz egy limitált paletta a saját tompított
  sávjával — amit a festő úgy kap, hogy minden színt a semleges felé húz.
  - **Miért nem a rács + Lloyd**: az egyenletes szórás a mask *területét* írja le
    tisztességesen, de nem paletta. A választott pontok önkényesek voltak, és egyik sem
    volt sem a sarok, sem a semleges, amiből az ember kever. A csere egyben törölte a
    rácsméret-keresést, a cell-capet és a raszteres Lloyd-menetet a hibalehetőségeikkel.
  - **Minimum-szeparáció `0.05` Oklabban**, ami *pont a festék-illesztés toleranciája*
    (D40): két ennél közelebbi szín ugyanarra a tégelyre illeszkedik, tehát mindkettőt
    kilistázni zaj, nem információ. Főleg az ív-alapú preseteknél számít, amiknek a
    csúcsai a görbe simaságáért vannak, nem jelölnek semmit: nyersen az analóg ék 31, az
    atmoszférikus 29 jelöltet ad, szinte mindet szomszéd-duplikátumként; szeparálva 8-at
    és 10-et. A triád és a split mind a 7-et megtartja.
  - **A darabszám az alakot követi**, nem egy csúszkát: egy csúcs hozzáadása négy új
    jelölt (csúcs, élfelező, és a kettő félútja). A **Colors csúszka megszűnt** — nem volt
    már mit szabályoznia (F6). Mérve: triád 13, split 12, analóg 9, atmoszférikus 11.
  - **A rendezés szöge kvantálva** van az összehasonlításnál. A belső gyűrű több színt tesz
    ugyanarra a hue-ra (egy sarok és a félerős párja), de a thetáik csak ~1e-13-ig
    egyeznek, tehát a nyers értékek összehasonlítása a zajra bízta a sorrendet, és egy
    ártalmatlan újraszámolás átrendezte a listát. Kerekített egész kulcs + telítettség
    szerint csökkenő: `(theta, t)` itt egyedi, mert két azonos pár ugyanaz a pont lenne,
    amit a szeparáció már kidobott.
  - **A D25 ezzel valóra vált**: egy elég kicsire zsugorított mask jelöltjei egymásba
    esnek, tehát tényleg kevesebb szín jön — amit a D25 mindig is leírt, és amit a régi
    rács-mintavevő soha nem tett meg. A **D39** ezzel tárgytalan, az 5. pontba került.
  - **A csúcsok a határon vannak, nem szigorúan belül.** Szándékos: a sarok színe a
    paletta széle, azt érdemes mutatni, és a kör színe egy pontban attól függetlenül
    definiált, hogy a kontúr melyik oldalára esik.
  - **A semlegesnek nincs hue-ja**, ezért `theta = 0`-ra és az origóra van snappelve —
    különben a szimmetrikus mask centroidjának ~1e-17-es koordinátáiból zaj-szöget
    olvasnánk, ami instabil rendezést adott —, és a listában **saját „Neutral" csoportot**
    kap — a képernyőn **és** az exportált lapon egyaránt; egy szürkét hue-szeletbe
    sorolni hazugság lenne, és ha a kettő nem ugyanoda sorolná, az még rosszabb.
- **D46 — Hover-kiemelés a listáról a körre**: a színlista egy sora fölé érve a körön
  megjelenik egy gyűrű annál a mintánál. Fókuszra is, nem csak hoverre — a sorok eleve
  `<button>`-ök, tehát a billentyűzetes végigtabolás ingyen megkapja.
  - **Additív, nem visszavont döntés**: semmit nem érint az 5. és 7. pontból.
  - **Az állapot nem a reducerben van**, hanem `useState`-ben az `App`-ban:
    prezentációs, a lista fölötti minden pointer-mozgásra változik, és a D18 a reducert a
    mentésre érdemes dolgokra tartja.
  - **Indexet tárol, nem `Sample` objektumot.** Ha a maszk változik, amíg a kurzor egy
    soron áll, egy eltárolt objektum elavul, és a kör egy már nem létező pozíciót
    jelölne. Az index a mindenkori listára oldódik fel, vagy semmire, ha a lista
    rövidebb lett — magától korrigál.
  - **A gyűrűn `pointer-events: none`.** A maszkon *belül* van, pont a body-drag
    találati területén; e nélkül egy swatch fölé érve a kör egy része
    meghúzhatatlanná vált volna. Ugyanaz a hibaosztály, mint korábban a handle/él
    ütközés — böngészőben ellenőrizve, hogy a gyűrű közepe alatt a maszk body-ja van.
  - **Két koncentrikus vonás**, sötét majd világos, hogy bármilyen hue felett látszódjon.
    A rádiusz `0.05`: tizenkét minta egy triádban kb. `0.27`-re esik egymástól,
    harminckettő kb. `0.17`-re, tehát jól látható anélkül, hogy a szomszédjára lógna.
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
  - **Hol tárolódik**: `offset: Point` az állapotban. A sorrend: **skálázás, majd offset,
    majd rotáció** — `R(size * base + offset)`. Az offset a *skálázás után* jön, tehát
    hogy milyen messzire mozgatható a mask, nem függ attól, mekkora. A rotáción viszont
    *belül* van, így a rotálás továbbra is **körbeviszi** az elcsúsztatott maskot a körön,
    nem a helyben forgatja — ez a természetes olvasat, és amit a D38 (atmoszférikus
    preset) is feltételez.
  - **Javított hiba (0.18)**: eredetileg az offset a skálázás *előtt* volt alkalmazva
    (`size * R(base + offset)`), tehát a kijelzett elmozdulás `size × offset` volt. Mivel
    az offset a diszkre van clampelve, egy lekicsinyített mask arányosan rövidebb utat
    tudott megtenni: `size = 0.1`-nél a középpontja `0.068`-as rádiuszig ért el, a peremet
    egyszerűen nem lehetett elérni. A tesztek ezt nem fogták meg, mert a meglévő
    „követi a kurzort" teszt olyan kis deltát használt, ami sosem érte el a clampet — ott
    az osztás és a szorzás pontosan kiejtette egymást. Ami hiányzott, az az **elérhetőség**
    tesztje, nem a követésé.
  - **Amit a sorrend hoz**: a size változtatása a maskot *helyben* méretezi, nem húzza
    vissza a közép felé.
  - **Miért skalár, nem a vertexekbe beégetve**: ugyanaz az érv, mint a rotációnál és a
    méretnél. A D22 clamp lossy: a peremre húzott mask vertexei odaragadnak, és ha ezt a
    tárolt polygon szenvedné el, a visszahúzás nem állítaná helyre az alakot. Mérve:
    böngészőben a maskot a peremig húzva egy vertex tényleg beragad, visszahúzva viszont
    az alak **pontosan** visszaáll (max. eltérés 0).
  - **Nem az `offset`-et clampeljük, hanem azt, hogy hová kerül a mask.** A kirajzolt
    közép `size * baseCentroid + offset`; ha csak az offset van a diszkre clampelve, az
    elérhető pozíciók egy `size * baseCentroid` körüli egységdiszket adnak — ami minden
    olyan masknál el van csúszva, aminek a *saját* közepe nincs az origóban, azaz minden
    átformázott masknál.
  - **Javított hiba (0.22)**: egy kézzel „átfordított" háromszögnél a mask közepe jobbra
    0.82-ig, balra viszont csak 0.60-ig volt tolható; fölfelé 0.57, lefelé 0.79. A
    kirajzolt közepet clampelve minden irány a peremig ér (mérve: 0.74 / 0.75 / 0.73 /
    0.70 — a maradék szórás abból van, hogy egy nagy mask vertexei a peremre ragadnak és
    visszahúzzák a rajzolt súlypontot, ami elkerülhetetlen).
  - **A mask továbbra sem hajítható el a körről**: a kirajzolt közép a diszken belül
    marad, a vertexek pedig a peremen ragadnak (D22).
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
| D39 | Mintavételi minimum-osztás (`MIN_PITCH`) | Tárgytalan: a rács-mintavevővel együtt kiesett. A D47 perceptuális szeparációja tölti be ugyanezt a szerepet. |
| D17 mechanizmusa | Rács + bináris rácsméret-keresés + Lloyd, N csúszkával | A minták most a mask geometriájából jönnek (D47). A determinizmus és a szög szerinti rendezés megmaradt. |
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

Későbbi jelölt: állapot mentése/betöltése. (A D49 visszavonás-verme ehhez nem
persistencia: memóriában él, a lapújratöltés törli.)

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
- 0.17 — **hover-kiemelés (D46)**: a listáról a körre. Additív, semmit nem von vissza.
- 0.18 — **hibajavítás (D42)**: az offset a skálázás után alkalmazva, így egy kicsi mask is
  a peremig mozgatható. Regressziós teszt az elérhetőségre, nem csak a követésre.
- 0.19 — **a minták a mask geometriájából (D47)**: közép + csúcsok + élfelezők, 0.05-os
  Oklab-szeparációval. A rács + Lloyd és a Colors csúszka kiesett, a D39 tárgytalan, a
  D25 valóra vált. A semleges saját csoportot kap.
- 0.20 — **belső gyűrű (D47)**: minden csúcs és élfelező félútja a közép felé, azaz +6 szín
  egy triádon (7 → 13). A rendezési kulcs kvantálva; a semleges csoport az exportált lapra
  is átkerült.
- 0.21 — **hibajavítás (D22)**: a clamp a kirajzolt vertexre vonatkozik, nem a tároltra, és
  egyszer fut a pipeline végén; a transzformációs primitívek tiszták. Egy vertex innentől
  bárhová húzható a körlapon, méretezett és elmozgatott maszkkal is.
- 0.22 — **hibajavítás (D42)**: a mask-húzás azt clampeli, hová kerül a mask, nem az
  `offset`-et. Átformázott (nem közép-szimmetrikus) masknál a mozgatás irányonként
  aszimmetrikus volt.
- 0.23 — **gyártó-szűrő (D48)**: jelölőnégyzet gyártónként, `BRANDS`-ből generálva. Az üres
  szűrő „nincs illesztés"-t jelent, nem „nem találtunk"-ot.
- 0.24 — **szerkesztési kényelem (D49)**: visszavonás/újra gesztus-granularitással, kézi
  értékbevitel a rotációhoz és a mérethez, szög-rasztolás a hat anchorra, és egy szó a
  festék-eltérésről a dominánsabb tengely szerint. Plusz a fogantyúk mérete a legközelebbi
  szomszédos csúcspárból származik — az ív-presetek fogantyúi 100%-on is átfedtek.
- 0.25 — **elérhetőségi visszajelzés (D50)**: fátyol a körön arra, amit egyik engedélyezett
  gyártó sem ér el 5%-on belül, plusz „N of M matched" a lista fejlécében. A küszöb a
  tolerancia kerekítési határából jön, és teszt köti össze a `matchingPaints`-szel. A
  területi fedés ~58%, nem a jegyzetben szereplő 73.4% — az cellánkénti volt.
- 0.26 — **a D50 fátyol alapból kikapcsolva**: a szerző szerint a korong 42%-át beborító
  árnyékolás csúnya. A jelölőnégyzet a helyén, a számláló változatlanul mindig látszik.
- 0.27 — **harmadik gyártó (D51)**: 138 Pro Acryl szín. A `BRANDS`-ből származó dolgok
  (szűrő, elérhetőségi mező, lap-sormagasság) maguktól követték; az `ENTRY_H` fixen két
  gyártóra volt szabva, most számított. A fedés 58.3% → 59.7% területre, viszont a minták
  22%-ánál a Pro Acryl a legközelebbi tégely. Mellékesen javítva: a D50 jelölőnégyzete a
  PAINTS fejlécsorába költözött, mert a saját sora 1280×720-on lelökte a D10-es caveatot.
- 0.28 — **negyedik gyártó (D52)**: 105 Citadel szín a Painting System plakátból. Az
  egyetlen OCR-es extractor (macOS Vision), mert a forrásban nincs szövegréteg, és az
  egyetlen márka, ahol a `ref` maga a név. A tizenkét GW shade-et a lapossági küszöb
  dobta ki, névlista nélkül. Mellékesen: a caveat szövege rövidebb, mert négy
  jelölőnégyzet két sorba tördelődik és megint lelökte volna 1280×720-on.
- 0.29 — **váltható színkörök (D53)**: saturated / pastel / muted / shadow, chip-sorral a
  panel tetején. Egy kör = egy közép + egy perem; a szögkonvenció közös, tehát a mask
  átvihető és az anchorok maradnak. A muted 97.4%-os festék-elérhetőséggel a praktikus
  változat a régi 60.1% ellenében. A D10-es caveat a kör alá került, ahol van hely.
- 0.30 — **indulásnál csak az AK Interactive** (D48 módosítása): négy bekapcsolt gyártó
  négy festéksort jelentett minden szín alatt, mielőtt bárki megmondta volna, milyen
  festéke van. A default egy gyártó, a többi a szűrőből jön.
- 0.31 — **60-30-10 paletták (D54)**: három javaslat maskonként a lap alján, arányos
  sávként. A szerepeket Munsell egyensúly-elve szabja meg (A·V·C állandó), tehát a
  területek 0.6/0.3/0.1-nél 1:2:6 erősséget kívánnak; a `balance` szám kiírva mondja meg,
  ha egy mask ezt nem tudja. A mask-súgó a kör alá került, hogy legyen hely a sornak.
- 0.32 — **hat preset ikonos rácsban (D55)**: a gombok a preset saját geometriájából
  rajzolt ikonok, 3×2-ben. Két új forma: **Complementary** (Gurney hosszú rombusza, a
  másik általa ajánlott alak) és **Rectangle** (két komplementer pár). A Rectangle adja a
  legtöbb színt (15) és 1.00-s egyensúlyt.
- 0.33 — **hibajavítás (D42, harmadik alkalom)**: a mask-húzás horgonya a **kirajzolt**
  alakzat közepe, nem a tárolt polygon centroidja. A kettő csak addig egyezik, amíg minden
  tárolt csúcs a körlapon belül van; a D22 viszont szándékosan engedi kívül (40%-os
  méretnél átformázva a tárolt rádiuszok 2.4-ig mennek, és épp ez teszi a méret-csúszkát
  visszafordíthatóvá). Olyankor a tárolt centroid nem a körön lévő pozíció, és a húzás
  **visszafelé** vitte az alakzatot: a kirajzolt formán mérve egy átformázott analóg mask
  lefelé −0.03-ot, balra −0.19-et „utazott". Clampeléssel a horgony mindig a körlapon van,
  egy elférő masknál pedig pontosan a régi érték, tehát az eredeti aszimmetria-javítás
  változatlan. A regressziós teszt a **kirajzolt csúcsok átlagán** mér, nem az offseten és
  nem a terület-centroidon (az utóbbi egy clampelt, elfajuló gyűrűn elszáll).
- 0.34 — **a 60-30-10 az exportált lapon is (D54)**: arányos sáv, `balance` szám, és
  szerepenként a részarány, a hex és a festéktalálat. A `layoutSheet` közös, tehát a PDF és
  a JPEG egyszerre kapta meg.
- 0.35 — **a 60-30-10 pontozása vektoros (D54 javítása)**: az erősség value × chroma a hue
  irányába, és a paletta akkor egyensúlyos, ha a súlyozott összeg a semlegesre esik. A
  korábbi, csak nagyságot néző pontozás három ciánt is választott (60–98% bias); az új a
  körön átnyúló maskoknál 3–9%-ot ad, és ahol lehet, három különböző hue-családot használ.
  A kiírt szám `bias` (0% = egyensúlyos), a `balance` arány helyett.
- 0.36 — **a 60-30-10 mindkét Munsell-felét pontozza (D54 javítása)**: a súlyozott
  momentumok egyenlő hosszúak ÉS nulla összegűek. Az irány-feltétel háromnál nem
  kényszeríti ki a nagyságot, így bejött egy séma, ahol az akcentus 7%-kal volt erősebb a
  másodlagosnál. Két reziduum, hipotenúzaként összevonva (`off %`), a két fél a tooltipben.
  A szakasz tooltipje az erősséget is kiírja, mert a lista `S`-e hue-nként normalizált.
- 0.37 — **hover-magyarázat (D56)**: saját tooltip a natív `title` helyett, data-attribútumokkal
  és dokumentum-szintű figyeléssel. A preset-ikonok Gurney jellemzésével mondják el, mire
  jók; a színkártyák elmagyarázzák a számokat, köztük hogy az `S` hue-nként normalizált.
