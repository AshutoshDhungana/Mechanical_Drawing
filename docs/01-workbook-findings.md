# VertGate Workbook — Reverse-Engineering Findings & Web Port Plan

| | |
|---|---|
| Source file | `Vertical-Lift-Gate.xlsm` (2.9 MB, project root) |
| Analysed | 2026-10-17 |
| Workbook authors | Gokarna Pyakurel (created 2017-11-18), last modified by Bikalpa Khadka (2023-08-18) |
| Status | Findings complete; decisions recorded (§9); build not started |

---

## 1. What the workbook is

An **Excel/VBA design calculation workbook ("VertGate")** for **hydraulic vertical lift gates** (fixed-wheel or bulkhead) for hydropower intakes. It is *not* a Visual Studio product. It descends from a US imperial tool ("VERTGATE FOR EXCEL", references Erbiste, *Comportas Hidráulicas*), later adapted to metric units and Indian standard sections (ISMB/ISMC), IS-based wheel design and 6×37 wire rope.

It takes gate geometry and water levels, sizes the structure (beams, stiffeners, skin plate, seals, wheels, axles, end beams), computes weight / centre of gravity, operating loads, hoist (rope drum) and embedded parts, and summarises ~60 headline results on the `Summary` sheet.

**Drawings:** the 21 embedded objects are **static AutoCAD OLE sketches** (`AutoCAD.Drawing.18/19/20`) with *letter labels* (bh, bt, dt, Lr, dweb, a₁, b′/2 …). They do **not** change with inputs. Parametric/scaled drawing generation is therefore a **new capability** of the web app, not a port.

How it was analysed: the `.xlsm` is a ZIP of XML + `vbaProject.bin`. VBA was extracted with `olevba` (oletools), formulas/values/validations/protection with `openpyxl`, drawing previews rendered from the EMF/WMF fallbacks.

---

## 2. Package inventory

| Item | Count / detail |
|---|---|
| Worksheets | 24 (14 visible, 9 hidden, 1 very hidden) |
| Formulas | ≈ 7,000 |
| Named ranges | 108 |
| VBA | ≈ 1,100 lines of real code across sheet modules |
| Embedded AutoCAD objects | 21 (Seals ×11, Wheel Design ×5, Downpull ×3, Plates ×2) |
| Charts | 1 (in `Embedded` / `Hoist` area) |
| Images | EMF/WMF previews of the OLE objects + 3 raster images |
| External links | 2 dead links to old local files (`C:\Users\DEll\Desktop\26Nov2017\vertgate_2017.xlsm`, `C:\Users\gokarna.pyakurel\Desktop\2.xlsm`) + network path `\\bdplin-fil3\DATA\tmp\ERA\INDIAN Steel Table.xls` on `ISMB` |
| Sheet protection | Password `07978`, applied by `Workbook_Open` (UI-only protection) |

Most-used functions: `IF` (2308), `OFFSET` (899), `SQRT` (788), `MIN` (213), `SUM` (190), `ROUND` (147), `SIN` (129), `PI` (127), `VLOOKUP` (120), `OR` (102), `MATCH` (82), `MAX`, `RIGHT`, `AND`, `FORECAST` (40, table interpolation), `CONVERT`, `CEILING`.

---

## 3. Sheets

| # | Sheet (file) | State | Formulas | Role |
|---|---|---|---|---|
| 1 | Summary (sheet1) | visible | 62 | Master project inputs (levels, span, height) + headline results |
| 2 | Beam Spacing (sheet2) | visible | 174 | Horizontal beam layout, hydrostatic + seismic pressure, loads per beam. **VBA solver** |
| 3 | Define Beam (sheet3) | visible | 44 | Section per beam (rolled ISMB or fabricated) via `ShapeData` lookup |
| 4 | Stiffeners (sheet4) | visible | 103 | Vertical stiffener spacing/depth/thickness/count per beam |
| 5 | SecProp (sheet5) | visible | 502 | Composite section properties (beam + effective skin plate), gate-type switches. **VBA TaperCalc** |
| 6 | Stress (sheet6) | visible | 467 | Bending/shear/combined stress checks (ASD, Ωb = 1.67) |
| 7 | Seals (sheet7) | visible | 33 | Lintel / side / sill seal geometry and friction |
| 8 | Wheel Spacing (sheet8) | visible | 80 | Wheel layout along gate height (same solver family as beams) |
| 9 | Wheel Design (sheet9) | visible | 267 | Wheel contact stress (elliptical / line), axle, track, end beam, cantilever vs double support. **VBA solvers** |
| 10 | Wheel Design IS (sheet10) | hidden | 19 | IS-code wheel check variant |
| 11 | Downpull (sheet11) | very hidden | 3,489 | Hydrodynamic downpull vs gate opening (shown only for downstream skin plate & wheeled gates) |
| 12 | Lib (sheet12) | hidden | 11 | Lookup tables: shapes, gate types, friction, ballast, concrete types, deflection list |
| 13 | Plates (sheet13) | hidden | 504 | Skin-plate panel bending coefficient tables (load cases A/B) |
| 14 | Weight & cg (sheet14) | visible | 401 | Component weights and centre of gravity |
| 15 | Operation (sheet15) | visible | 153 | Hoisting/closing forces vs opening (friction, downpull, ballast). **VBA min/max scan** |
| 16 | Rope Drum Hoist (sheet16) | hidden | 32 | Older/simplified hoist sheet (still feeds Summary rows 14.12, 14.13, 14.17, 14.20) |
| 17 | Embedded (sheet17) | hidden | 160 | Older embedded parts calc |
| 18 | Hoist(Rope Drum) (sheet18) | visible | 263 | Detailed rope-drum hoist: rope, drum, gearing, motor, manual operation |
| 19 | Embedded Parts (sheet19) | visible | 176 | Slot/niche contours, track, seal plates, anchors, weight |
| 20 | 6x37 Rope specification (sheet20) | hidden | 0 | Rope data table |
| 21 | ISMC (sheet21) | hidden | 62 | Channel section table |
| 22 | ISMB (sheet22) | hidden | 15 | I-beam section table |
| 23 | material (sheet23) | hidden | 0 | Material data |
| 24 | Sheet3 (sheet24) | hidden | 0 | `RopeData` table |

### Data flow

```
Summary inputs (span, clear height, HFL/NWL/sill, deck levels)
  → Beam Spacing ──→ Define Beam (ISMB lookup) → Stiffeners → SecProp → Stress
  → Seals ────────┐
  → Wheel Spacing → Wheel Design (+ Wheel Design IS) → Downpull
                  └→ Weight & cg → Operation → Hoist(Rope Drum) / Rope Drum Hoist
                                             → Embedded Parts / Embedded
  → Summary outputs
Lookup tables: Lib, Plates, ISMB, ISMC, 6x37 Rope, material, Sheet3
```

---

## 4. Inputs (user-editable cells)

Unlocked cells = inputs. Key ones (current values in brackets):

**Summary** — Location [Intake], Clear span D5 [3.5 m], Clear height D6 [2.8 m], No. of openings D7 [4], HFL D8 [745.53], NWL D9 [742], Sill level D10 [738], Gate operating platform D12 [747]. Derived: hoist deck D11 = D12 + D + 0.3; design head D13 = HFL − sill.

**Beam Spacing** — `N` beams [5], `SpaceMethod` [Equal moments | Equal load (classic) | Equal load (exact) | Manual], `Acc` rounding [0], `D` gate height to top seal [2.9], `Lsup` span between supports [3.9], `HB` depth of water to sill [7.53], `Hp` upstream pool depth [7.53], `Alp` seismic OBE factor [0.024], `Rw` water density [9.81].

**Define Beam** — per beam: type [I Shape | Fabricated], designation [ISMB 350]; fabricated → flange/web dims.

**Stiffeners** — per beam: spacing, depth, thickness, count.

**SecProp** — `Loc` skin plate [Upstream|Downstream], `GType` [Fixed Wheel (cantilevered) | Fixed Wheel (double support) | Bulkhead (no wheels)], `PType` [Line Contact | Elliptical Contact], E [206000], Fyb/Fys [250], Fyw [400], `Lse` seal span [3.6], β [0.75], Ωb [1.67], `tap` taper length, `dweb` web depth at support [0.25], skin plate thickness per beam [0.012].

**Seals** — Lintel/Side/Sill type (`LinType`, `SidType`, `SilType`), bulb Ø, stem t, deflection δ, projection x, μ, clamp width/thickness, mount thickness, (wedge) top bar thickness, seal height.

**Wheel Spacing** — wheels per side [2], method [Equal load], accuracy, seismic included.

**Wheel Design** — design load, wheel Ø, cross radii, ν, E, hardness, tread width, hub/rim dims, line-contact block (P, D, l, Yp, UTS, hardness, FOS), track (Es, beam, plate b × d, concrete grade), axle (lateral factor, hub length, Ø, yield, support thicknesses, clearance, bearing stress).

**Downpull** — gate location [Face|Tunnel], bottom angle θ, lip ratio e/d, clearances a1/a2, max flow Q [90 m³/s], opening ratio.

**Operation** — ballast weight & density, wheel bearing friction.

**Hoist(Rope Drum)** — lifting load C5, drums, falls/drum, pulley efficiency, rope type/grade/core/Ø, drum PCD, reducer efficiencies. **Rope Drum Hoist** — rope Ø/grade, drums, sheaves, efficiencies, motor rpm, persons, handle Ø.

**Embedded / Embedded Parts** — seal plate, precompression, track rail, offsets, channel selections, holding plate, anchor spacing, sill plate.

Full cell-level inventory can be regenerated with the extraction scripts in §10.

---

## 5. VBA — what matters

~70% of the VBA is UI plumbing: copying/deleting row blocks when `N` changes (`UpdateBeams`, `Worksheet_Deactivate`), locking/colouring cells, hiding sheets/rows/drawings based on gate type, seal type and contact type, page breaks, protection. **None of that is ported**; the web UI replaces it with arrays and conditional rendering.

Visibility rules worth keeping as UI logic:
- `GType = Bulkhead` → hide Wheel Spacing, Wheel Design, wheel rows in Weight & cg.
- `Loc = Downstream` and not bulkhead → show Downpull.
- `PType` switches Elliptical vs Line-contact wheel blocks.
- Seal type switches which seal sketch/rows apply; `No Lintel Seal` hides lintel rows.

### The four real solvers

**1. Beam spacing (`BeamSpace` module; duplicated in `WheelSpace`)**
- *Equal moments* (default): guess top spacing L0 = D/(2n); successively solve each next spacing from a cubic so skin-plate moments above/below each beam are equal (`BeamSolve`, closed-form cubic with trig branch); scale L0 by D/ΣL; iterate (≤100) until L0 stable to 1e-8.
- *Equal load, classic*: closed form (Erbiste p.130), `C = n(HB−D)²/(HB²−(HB−D)²)`.
- *Equal load, exact*: start from equal moments, iterate (≤2000) with three-moment-equation moments (`Moments`) and reactions (`Reactions`) until every beam carries LPB = (HB² − (HB−D)²)/2/n·Rw.
- *Manual*: user spacings.
- `Accuracy`: round spacings down to `Acc`, then round up the worst ones until ΣL = rounded D.
- Results written to `Beam Spacing!C{BSref + 3(x−1)}`; L(0) (top cantilever) = D − ΣL.

**2. Wheel `Findk` / `Maximize` (`WheelDesign`)** — step searches on elliptical-contact parameters: `Findk` adjusts k′ (start 0.97, step 0.01→/10 ×10) until a balance cell crosses zero; `Maximize` adjusts φ (start 0.5, step 0.1→/10 ×5) to maximise Zy. Replace with a proper root-finder / 1-D maximiser.

**3. `TaperCalc` (`SecProp`)** — per beam, steps the "distance from support for max moment" up to the taper length to find where taper bending stress peaks (works internally in inches/psi via 39.37 and 145.0377). Replace with a 1-D maximiser in SI.

**4. Operation scan (`Operation` activate)** — sweeps opening 0→1 in 0.01 steps to find min (closing) and max (lifting) hoist load; writes the governing opening to C12/D12. Port as a plain loop over opening.

### Verified port (beam spacing, equal moments)

Python port reproduces the workbook's cached spacings to 6 dp
(n = 5, D = 2.9, HB = 7.53 → L = 0.2724, 0.6383, 0.6101, 0.5868, 0.5670, 0.2255 m):

```python
import math
def beam_solve(c1, c2):
    c3, c4 = 3*c1*c2**3, 81*c1**2
    c5 = 6*math.sqrt(abs(c3-c4)); c6 = 54*c1 - c2**3
    if c3 > c4:
        c7 = math.hypot(c6, c5)
        return (2*c7**(1/3)*math.cos(math.acos(c6/c7)/3) - c2)/6
    c7 = math.copysign(abs(c6+c5)**(1/3), c6+c5)
    return (c7 + c2**2/c7 - c2)/6

def equal_moment(n, D, HB):
    lno = round(D/(2*n), 9); H=[0.0]*(n+1); L=[0.0]*(n+1); H[0]=HB-D
    for _ in range(100):
        L[0]=lno; H[1]=H[0]+L[0]
        L[1]=beam_solve(L[0]**2*(30*H[0]+10*L[0]), 5*H[1])
        for x in range(2, n):
            H[x]=H[x-1]+L[x-1]; L[x]=beam_solve(L[x-1]**2*(5*H[x-1]+3*L[x-1]), 5*H[x])
        H[n]=H[n-1]+L[n-1]; L[n]=beam_solve(L[n-1]**2*(H[n-1]+3*L[n-1]/5)/2, 3*H[n])
        new = round(L[0]*D/sum(L), 8)
        if new == L[0]: break
        lno = new
    return L
```

Pressure per row (Beam Spacing col G): `p = (h + 7/8·Alp·√(Hp·h))·Rw` (hydrostatic + Westergaard seismic). Effective skin-plate width factor: `min(1, 1.1/(1 + 2(2b/Lsup)²))`.

---

## 6. Defects found in the workbook (do NOT port)

| # | Defect | Effect |
|---|---|---|
| 1 | Named range `WDref` = `'Wheel Design'!#REF!` | `Findk`/`Maximize` fail on first line → elliptical-contact wheel solve broken |
| 2 | Seals VBA writes **inch** defaults (1.75, 0.5625, 0.125…) into cells now in **mm** | Changing a seal type corrupts dimensions; sill block C51/C53/C54/C59 still holds inch values |
| 3 | `Hoist(Rope Drum)!C5` lifting load hard-coded `118` | Hoist sizing not linked to Operation results |
| 4 | E = 193,053 MPa in Wheel Design vs 206,000 elsewhere | Inconsistent material constant |
| 5 | Dead external links (old desktops, network share) | `Wshape` range and ISMB source unreachable |
| 6 | 31 cached `#DIV/0!` (Beam Spacing 15, Wheel Spacing 16) | Unused/stale rows beyond current N |
| 7 | ~~Stiffeners has 6 per-beam blocks while N = 5~~ | **Withdrawn:** the six blocks are the n + 1 skin-plate panels (above beam 1, then below each beam), which is correct |
| 8 | Data-validation minimums still imperial (`0.0254*12` etc.) | Wrong input bounds |
| 9 | Two parallel hoist and embedded sheets (old hidden + new visible) both feed Summary | Ambiguous source of truth |
| 10 | Typo `DefineBeam.EnableSelection = xlUnlockedCellsa` | Harmless (On Error Resume Next) |

Each must be confirmed with the engineering owner before choosing the corrected behaviour.

### 6.1 Found while porting Define Beam, SecProp, Stress and Stiffeners (2026-10-17)

**Fixed in the port** (spreadsheet slips; each fix is asserted in `web/src/calc/structure.test.ts`):

| Where | Slip | Effect in the workbook |
|---|---|---|
| Stress, bottom panel point ⑤ (`Z68`) | Multiplies by `Stress!Z129`, an empty cell | Flange-edge plate moment below the bottom beam is always 0 |
| SecProp shear `V41`, `V58`, … | Beam *i*'s cell reads beam *i*−1's block | Shears shift down one beam; the bottom beam's shear is never shown |
| SecProp taper `V43`, `V60`, … | Beams 2..n lack the `/0.0254` that beam 1 has | Taper moments and stresses 39× too small for beams 2..n |
| SecProp welds `V21`–`V23` | Rounds a size in metres up to 1/16 (in) | Skin weld always 1/16 in; fabricated welds show 0.0625 "m" |
| Stress, intermediate/bottom panel beam-theory moments (`Y`) | Mix ×0.0254 and plain values | Wrong only when stiffener spacing ≥ 2× panel height (beam theory used) |
| Stiffeners `E16` | Rounds the web thickness in metres to 1/16 | Suggested stiffener thickness always 0 |
| Stiffeners `J21`… weight | Always uses the top panel's skin thickness (`SecProp!I13`) | Wrong when skin thickness varies by panel |
| Stiffeners `E15` | Top panel's depth suggestion reads beam 2 | Wrong when beams 1 and 2 differ |

**Ported as the workbook has it, flagged for the engineer** (formula/method questions; changing them changes results):

| Where | Workbook | Reference / expectation |
|---|---|---|
| SecProp `rt` (`AC17`) | `bfc / √(1·(ho/d + aw/6·h²/(ho·d)))` | AISC 360 F4-10 has **12** under the root, so the workbook's rt is √12 ≈ 3.5× too large (unconservative Lp, Lr). Doesn't govern the saved design (Lb = 0.3 m) |
| SecProp `Rpg` (`Z26`) | `1 − aw/(100 + 300aw)(…)` | AISC F5-6 uses **1200** + 300aw. Inactive unless the web is slender |
| Stress modified loads (`AK18`, `AK26`) | Upper beam gets `+(M_lower − M_upper)/L` | Opposite sign to Beam Spacing's continuous-beam reactions (and standard statics). Shifts up to ≈0.4% of load between beams on the saved design; total unchanged |
| Stress top panel `AF12` | My uses hydrostatic case **C** (`CCCFH`) | Mx uses case A (`CCCFD`); case A My would be `CCCFE` |
| Stress bottom panel `Y68` | Cantilever length uses effective width L·J | Physical length is L (same when J = 1) |
| SecProp skin weld lever (`V21`) | Uses distance to the *tension* face (`cgt`) | First moment of the skin plate should use its distance from the neutral axis (`cgc − ts/2` when upstream) |
| Stiffeners weight (`J21`…) | Adds the plate above and below every beam | Plate between beams counted twice (conservative) |
| Stress plate coefficients | Interpolated value rounded to 5 dp of the ×0.0254 number | Up to ≈0.3% precision loss |

### 6.2 Found while porting Seals, Wheel Spacing and Wheel Design (2026-10-17)

**Fixed in the port** (asserted in `web/src/calc/wheels.test.ts`):

| Where | Slip | Effect in the workbook |
|---|---|---|
| Wheel Design track `AA42` | Track plate's own inertia `b·d²/12` (should be `b·d³/12`) | Composite Ina, Zt, Zb wrong; track bending `C65` 44.8 MPa → 45.6 MPa corrected |
| Wheel Design cantilevered axle `C137` | `Mo = Wlat·P·D/2/1000`: kN·m divided by 1000 again (the double-support `C84` has no /1000) | Lateral moment 1000× too small; axle bending 40.9 → **77.3 MPa**, bearing at R1 67.9 → **112.5 MPa** (both still pass) |
| Seals sill block `C63:C70` | Old imperial formulas (no psi/0.001/×1000 conversions); `C51`, `C53`, `C54`, `C59` hold inch values (defect #2) | Wrong whenever the sill seal is not a wedge seal. Port uses the lintel/side SI formulas and mm defaults |
| Wheel Design double-support axle `C81`, `C84` | Always use the elliptical-contact P and D (`C6`, `C7`) | Line-contact gates are checked with the wrong load and wheel. Port uses the active contact type's P and D |
| Wheel Design `Q161` (skin face to wheel axis) | Subtracts the *lintel* seal (`C7`, `C15`, `C9`) from a slot depth built from the *side* seal; uses the line-contact wheel D for both contact types | Same value on the saved design (side = lintel). Port uses side seal and the active wheel |
| Stiffeners `Y17` (axle span / taper default) | Hard-codes `0.2` (= (Lsup − clear span)/2) and `0.002` (= clearance `C132`); uses the line-contact tread for both contact types | Same value on the saved design; goes stale when those inputs change |
| VBA `Findk` / `Maximize` | Start from `WDref` = #REF! (defect #1), so k′ and φ never update | Port solves k′ by bisection and φ by golden-section search: k′ matches the saved value to 1e-8, φ to 1.1e-5 (the VBA's step), Zy to 2.5e-9 |
| Seals lintel pressure `C18` | Negative above the water surface | Port uses 0 |

**Ported as the workbook has it, flagged for the engineer:**

| Where | Workbook | Question |
|---|---|---|
| Wheel Design `D94` | Double-support axle bending allowable `0.4·FyS` | No β, unlike the cantilevered `D146` (`0.4·FyS·β`) and the support plate `D95` |
| Wheel Design `D65` | Track bending allowable `0.4 × C33` | C33 is the **wheel's** yield strength, not the track's |
| Wheel Design `C64` vs `C65` | Concrete bearing uses the beam-only I; track bending uses the plate + beam Ina | Intended? |
| Wheel Design `J116`, `J170` | End beam Mn uses the axle support plate yield (`C77`, `C130`) | Should it be the plate/stiffener steel (`Fys`)? |
| Wheel Spacing `K3` → end beam | Max end beam moment = largest moment over a wheel | Span moments between wheels are not checked |
| Wheel Design `C11` | E = 193,053 MPa (defect #4) | Kept as the wheel input |

### 6.3 Found while porting Downpull, Weight & cg and Operation (2026-10-17)

**Fixed in the port** (asserted in `web/src/calc/ops.test.ts`):

| Where | Slip | Effect in the workbook |
|---|---|---|
| Weight & cg sill bulb `H26`, `J26` | Diameter is `Seals!C51` unscaled (the leftover 1.75 inch value read as metres); density is `CONVERT(0.05444 lbm→kg)·1000·9.81` = 242 kg/m³ | A non-wedge sill seal adds a 1.75 m bulb. Port uses mm and the rubber density of the other seal rows |
| Operation row 15 | Submerged fraction `MIN(1, HB/D − x)` goes negative once the gate is above the water | Buoyancy turns into extra weight. Port clamps at 0 (never reached on the saved design, HB/D = 2.6) |
| Operation `OFFSET(Downpull!$I$60, 0, 100·x)` | Truncates 100·x, so a value like 28.999… picks the wrong column | Port rounds |

**Ported as the workbook has it, flagged for the engineer:**

| Where | Workbook | Question |
|---|---|---|
| Operation row 27 | Downpull at gate opening x is read at Downpull's opening ratio x = y/yo | Same thing for a Tunnel gate (yo = D); for a Face gate yo = HB, so the two ratios differ |
| Downpull `C15` | Lead-in radius ratio r/d = 0.4 | Not used by any formula |
| Weight & cg `L34` vs `L42` | End beam / stiffener cg uses the larger adjacent skin thickness for the top panel, but that panel's own thickness below each beam | Tiny inconsistency; intended? |

### 6.4 Found while porting the hoist, embedded parts, Plates and Summary sheets (2026-10-17)

**Fixed in the port** (asserted in `web/src/calc/rest.test.ts`):

| Where | Slip | Effect in the workbook |
|---|---|---|
| Summary `D58` | `CONVERT(kg,"ton")` is the US short ton (907 kg) | Gate weight shown as 4.17 "t" for a 3.78 t gate |
| Summary `D34`, `D39`, `D43`, `D47` | Typed 4 mm seal deflections, 75 mm sill seal height, "Cantilivered" | Disagree with the Seals inputs (3 mm, 50 mm) and ignore the gate type |
| Summary `D48:D50` | Filled only for line contact | Blank (FALSE) for elliptical contact; port reports the active contact type |
| Summary `D74`, `D75`, `D79`, `D82` | Read the hidden legacy `Rope Drum Hoist` (defect #9) | Same values on the saved design; port reads the current hoist (poles from its motor speed) |
| Embedded Parts `I82` | Sill I beam weight typed as 106.68 kg (25.4 kg/m × 4.2 m, an old span) | Port uses 25.4 × 3.9 = 99.06 kg; total 3403.3 → 3394.9 kg |
| Rope table (`6x37 Rope specification`) | 52 mm 1770-CWR breaking force 11524 kN, 64 mm CF mass 14.71 kg/m | Port applies the errata in `rope_6x37.json` (not used by the saved 28 mm rope) |

**Ported as the workbook has it, flagged for the engineer** (each marked `ponytail:` in `hoist.ts`):

| Where | Workbook | Question |
|---|---|---|
| Hoist `C5` | Lifting load typed 118 kN (defect #3) | Jammed load is 2.5 × 48.3 = 120.8 kN; kept as an input, the app warns |
| Hoist `C10` | Rope tension `C5 / (2·(1 + η))` | Hard-codes 2 drums × 2 falls; No. of drums `C7` and falls `C8` are not used |
| Hoist `C55` | Drum speed `960 / reduction` | Motor rated speed is 925 rpm (`C52`); with 925 the lifting speed is 0.488 m/min, below the 0.5 target |
| Hoist `C104`, `C105` | Drum torque = rope tension × groove pitch (31 mm) | Lever should be the drum radius (350 mm): gear-train torques are ≈ 11× low |
| Hoist `J131`, `J135` / `J133`, `J137` | Tooth load = T / (z_gear/z_pinion · m) for gears, T / m for pinions | Neither is T / (pcd/2); combined with the row above, the gear stresses need a fresh check |
| Hoist `C36` | Motor "rated power" 3, used as HP in `71620·P/n` | Summary calls it "design capacity"; the motor list on Sheet3 is in kW |
| Hoist `C345` | Motor lifting speed for the manual drive typed 0.25 m/min | `C18` is 0.5 m/min |
| Hoist `C97` | Drum combined stress √(σc² + σb² + σc·σb) | Von Mises for plane stress has −σc·σb |
| Embedded Parts `F69`, `F83` | Side seal plate typed 10 mm (seal plate `C21` = 8 mm); sill seal plate typed 80 × 80 mm (196 kg) | Typos? Kept as inputs with those defaults |
| Legacy `Rope Drum Hoist` `D48`, legacy `Embedded` | Stroke = 2 × NWL head; section lookups under the wrong labels; sill plate wired to the anchor spacing | Dead sheets (nothing current reads them); ported as they are and shown read-only |

---

## 7. Drawing assets in the workbook

| Sheet | Sketches (static, letter-labelled) |
|---|---|
| Seals | Lintel/side/sill seal sections: center bulb, J seal, wedge seal (Objects 1–7) + others |
| Wheel Design | Wheel section (bh, bt, t, Rt, d, dh, dt, D), axle loading diagram (Lr, b, c, R1, R2, Mo, w), end-beam sections for double-support and cantilever (ts, Sr, e, d, f, c, y, dweb) |
| Downpull | Half-plan of gate in slot (B/2, b/2, b′/2, a1, a2, as, w′, recess, seal) |
| Plates | Skin-plate panel between stiffeners with load cases A (triangular) and B (uniform) |

These define the **explanatory sketch set** to reproduce, with real values substituted for the letters.

Re-checked in Phase 4 from the package itself. The sheet → OLE object → preview image mapping comes from `xl/worksheets/_rels` and `xl/drawings/_rels/vmlDrawing*.vml.rels`; the previews were rendered from the EMF/WMF files.
- **Seals:** 11 OLE objects but only **3 distinct previews**: J seal, center bulb seal, and wedge sill seal (labelled h, t, ct, bt, cw).
- **Wheel Design:** 5 previews: the wheel, two axle diagrams and two end-beam sections.
- **Downpull:** 3 previews: the half-plan, a clearance/velocity sketch, and the submerged and free-surface flow profiles.
- **Plates:** 2 previews: an interior panel with all four edges fixed (load cases A and B), and an edge panel with one edge free (cases A, B and C).
- **Hoist(Rope Drum):** a raster picture of the drum shaft (`image15.jpg`: bearings C and D, drum ends A and B, rope falls at X and Y).
- **Embedded and Sheet3:** two screenshots of web pages (bolt and motor-starter tables). These are reference data, not sketches.

---

## 8. Recommended architecture

- **Approach:** clean rewrite of the calculations as typed, pure modules — one per sheet — **not** running the sheets in a formula engine (would import 7k `OFFSET` formulas and the defects above). The workbook serves as the reference oracle.
- **Stack:** Vite + React + TypeScript, client-side only (calc is deterministic; no DB needed). Vitest for tests.
- **Units:** SI throughout internally; display units configurable per field.
- **Engine:** `inputs → modules in flow order → results + check flags (pass/fail, utilisation)`. Arrays replace the VBA row-block copying.
- **Persistence:** save/load a design as JSON. Server/project storage only if multi-user is needed later.
- **Drawings (two layers):**
  1. *Explanatory sketches* — SVG replicas of §7 with live values and dimension annotations.
  2. *Scaled engineering drawings* — geometry model built from calc results (gate elevation with beam positions, beam/end-beam sections, skin plate & stiffeners, wheel/axle assembly, seals, slot & embedded parts) rendered to true-scale SVG with dimensions, title block, sheet sizes, zoom/pan/layers; **DXF export** for AutoCAD; PDF export.
- **Report:** printable calculation report (print CSS / PDF) replacing Excel print areas.

---

## 9. Decisions (2026-10-17)

| Question | Decision |
|---|---|
| Scope | **Port all pages**, including hidden ones (Wheel Design IS, Downpull, Plates, Rope Drum Hoist, Embedded, lookup tables) |
| Drawings | **Both**: explanatory sketches **and** properly scaled, highly functional engineering drawings |
| Design codes | **Keep the workbook's stress-check methods** (ASD, Ωb = 1.67; IS-based wheel design) |
| Extra project workbooks for testing | **None available** — this workbook is the only reference dataset |

Consequence of no extra datasets: verification relies on (a) cached values in this workbook, (b) recalculating the original workbook in LibreOffice headless with varied inputs (formulas only; solver outputs are stored as plain values, so feed ported solver results in), (c) hand checks against textbook cases (Erbiste) for the solvers.

---

## 10. Phased plan

| Phase | Work | Done when |
|---|---|---|
| 0 | Extraction tooling: scripts dumping every sheet's inputs, formulas, cached values, named ranges, validations to JSON; export lookup tables (Lib, ISMB, ISMC, Plates, rope, material) | ✅ 2026-10-17: `tools/extract_workbook.py` → `data/tables/`, `data/golden/` (see `data/README.md`) |
| 1 | Per-sheet spec: formulas → named equations with units; resolve each defect in §6 with the engineer | Spec reviewed |
| 2 | Calc engine in flow order: Beam Spacing → Define Beam → Stiffeners → SecProp → Stress → Seals → Wheel Spacing → Wheel Design (+IS) → Downpull → Weight & cg → Operation → Hoists → Embedded Parts → Summary | Each module matches golden values (tolerance agreed) |
| 3 | UI: tabbed/step flow mirroring sheets, live results, check flags, gate-type/seal-type conditional sections | All inputs in §4 editable |
| 4 | Explanatory SVG sketches (§7) with live values | ✅ 2026-10-17: `web/src/ui/Sketches.tsx` |
| 5 | Scaled drawing engine: geometry model → scaled SVG with dims/title block → DXF + PDF export | ✅ 2026-10-18: `web/src/drawing/` |
| 6 | Calculation report + JSON save/load | ✅ 2026-10-18: Report tab, `web/src/designFile.ts` |

**Progress**
- 2026-10-17: Phase 2/3 vertical slice done for **Summary + Beam Spacing**. React + Vite + TS app in `web/`; `web/src/calc/beamSpacing.ts` ports all four spacing methods, rounding, and the sheet's pressure, load, moment and effective-width columns. Golden tests match the saved workbook to ≤7e-11 relative. Independent checks: equilibrium; equal-load (exact) loads equal; classic method matches the Erbiste equal-strip centroid formula. The screen has inputs, a beam/pressure diagram and a results table. The port's deliberate differences are listed in `web/README.md`.

- 2026-10-17: **Define Beam, SecProp, Stress, Stiffeners** ported (`web/src/calc/defineBeam.ts`, `secProp.ts`, `stress.ts`, `stiffeners.ts`, run in order by `structure.ts`). Every computed cell on the four sheets matches the saved workbook to 1e-9 relative, except the slips in §6.1, whose workbook values are asserted alongside the corrected ones. The app has tabs: Beam spacing / Beams & stiffeners / Section & strength / Stress checks. Until Wheel Design is ported, the stiffener end zone (`Stiffeners!O15`) and taper length default (`Stiffeners!Y17`) are plain inputs, defaulting to the workbook's values.

- 2026-10-17: **Seals, Wheel Spacing, Wheel Design (+ hidden Wheel Design IS)** ported (`web/src/calc/seals.ts`, `wheelSpacing.ts`, `wheelDesign.ts`; tests in `wheels.test.ts`, 94 tests in all). Wheel Spacing reuses the Beam Spacing solvers (the VBA modules are identical). Wheel geometry now drives the stiffener end zone and the taper default, which are no longer plain inputs. Every computed cell matches the saved workbook to 1e-9 except the §6.2 slips. New tabs: Seals / Wheel spacing / Wheel design (the wheel tabs are hidden for a bulkhead gate). The saved *elliptical* inputs are inconsistent (rim ID 0.2 m > wheel D 0.15 m; P 561.7 kN against a 159.6 kN max wheel load), so that path fails its checks until the engineer sets real values. `Embedded Parts!C21` (seal plate thickness) is a temporary input until Embedded Parts is ported.

- 2026-10-17: **Downpull, Weight & cg, Operation** ported (`web/src/calc/downpull.ts`, `weight.ts`, `operation.ts`; tests in `ops.test.ts`, 106 tests in all). Downpull reproduces the sheet's chosen opening, its 1%–99% sweep and the min/max; Weight & cg lists every component row (volume, weight, cg) plus the Erbisti estimate; Operation reproduces the closed-to-open table and the `Worksheet_Activate` min/max lifting-load scan. All match the saved workbook to 1e-9 (the Downpull sweep to 1e-8, since the sheet accumulates x in 0.01 steps). New tabs: Downpull (shown only for a downstream skin plate on a wheeled gate, as the workbook hides the sheet otherwise) / Weight & cg / Operation.

- 2026-10-17: **Hoist(Rope Drum), Embedded Parts, Summary, Plates and the hidden legacy Rope Drum Hoist / Embedded** ported (`web/src/calc/hoist.ts`, `embedded.ts`, `summary.ts`; tests in `rest.test.ts`, 121 tests in all). Every computed cell matches the saved workbook to 1e-9 except the §6.4 slips. Plates is the coefficient table Stress already uses (`plate_coefficients.json`, now checked cell by cell against the sheet). New tabs: Hoist / Embedded parts / Summary / Legacy sheets. **The Phase 2 calculation engine now covers every sheet.**

- 2026-10-17: **Phase 4 explanatory sketches** done in `web/src/ui/Sketches.tsx`. These are SVG redraws of the §7 sketches, not to scale, with live values written next to the letters; a letter stands alone when the port has no value for it.
  - **Seals tab:** lintel, side and sill seals (J, center bulb or wedge, as selected), including F, k and μ.
  - **Wheel design tab:** the wheel, the axle (double support or cantilevered, with w, Mo, R1, R2 and z) and the end-beam section (20 ts, Sr, e, d, f, c, y, dweb).
  - **Downpull tab:** the half-plan (a1, a2, a″2, d) and the flow at the chosen opening (H, hT, Hce, Δh1, Δh2, y, Cc·y, e, d, Q′, Q″, Vj, F).
  - **Stress checks tab:** the top panel and an interior panel, with a, b, q and q₀.
  - **Hoist tab:** the drum shaft (AC, AB, BD, CD, AX, XY, RT, Rc, Rd).
  - **Left out on purpose:** the Downpull clearance/velocity sketch, which is qualitative and has nothing to drive; the bottom-panel load case C; and the two web screenshots.
  - **Checks:** 122 tests (`sketches.test.tsx` fails on NaN or a missing value); checked in the browser for every gate type and skin plate location.

- 2026-10-18: **Phase 5 scaled drawings** done (`web/src/drawing/`, new **Drawings** tab). Geometry comes only from the calc results and the Weight & cg conventions (skin width E33, end plates E34, web taper, stiffener positions, seal stack-ups, wheel/axle layout from Wheel Design).
  - **Sheet 1, general arrangement:** elevation from the beam side, section A-A at midspan, section B-B above beam 1 (first-angle projection), at the largest ISO scale that fits the chosen A0–A3 sheet. Dimensions, cutting planes, flow arrows, a schedule of panels, beams and wheels, general notes and an ISO 7200-style title block.
  - **Sheet 2, details:** each at its own scale. The wheel and axle (a horizontal section C-C through the top wheel axis), the lintel, side and sill seals, and one section for each beam size.
  - **Output:** DXF (R12, layers OUTLINE/CUT/HATCH/HIDDEN/CENTER/THIN/DIM/TEXT/BORDER; full size in mm at the sheet scale), SVG, and PDF through the browser's print dialog at the exact sheet size. The DXF files were checked with ezdxf: 0 errors, and the extents are the sheet × scale.
  - **Assumptions, stated on the drawing where they matter:**
    - The wheel hub diameter is not in the calc, so it is drawn as 2 × the axle diameter (line contact; elliptical contact uses dh).
    - The cantilevered axle is drawn at d1 throughout (d2 is not drawn).
    - Seal bulbs sit on the seal lines (D at the top, Lse/2 at the sides).
    - The wedge sill seal follows the §7 sketch, with the clamp bar flush with the gate bottom.
  - **New input check:** with the saved sill dims (h = 50 < cw = 60), the wedge rubber does not reach the sill. The drawing warns about it; the input is not changed.
  - **Not drawn:** embedded parts and the slot (civil interface), bolts and welds.
  - **Checks:** 131 tests (true-scale measurement, beam and wheel positions against the calc, both sheets and the DXF for every gate type and skin location, clipping and hatching). Checked in the browser for cantilevered/upstream and double support/downstream.

- 2026-10-18: **Phase 6 report and design files** done.
  - **Report tab:** a cover (project, gate, date, highest utilisation ratio, every open warning) with the Summary on the first page, then one section per sheet in workbook order, each with its inputs (read-only), results and sketches. Printed through the browser on A4: one sheet per page and tables kept whole where they fit, 21 pages for the default design. Checked by printing it with headless Chrome. Drawings and the legacy sheets are left out; the drawings print from their own tab at sheet size.
  - **Design files:** **Save design** downloads every input as `<location>.vertgate.json` (`app`, `version: 1`, `inputs`). **Open design** checks the file against the default design's field types before anything reaches the calculation: wrong types, lists or numbers are rejected with the field path, and the open design is kept. Fields missing from an older file take the defaults. Drawing view settings are not saved (they are view state).
  - **Checks:** 134 tests (round trip, defaults for missing fields, rejection of damaged files). Save, edit and load, and a damaged file, were also checked in the browser.

**All six phases are done.** Open items:
- The engineer's decisions on the §6.1–§6.4 flagged formulas; nothing flagged has been changed.
- The sill wedge seal input check (Phase 5).
- The drawing assumptions listed under Phase 5.

Extraction scripts used for this analysis (re-creatable): `olevba --decode -c xl/vbaProject.bin`; `openpyxl` load twice (formulas and `data_only=True` values), unlocked cells = inputs, `ws.data_validations` = allowed values.
