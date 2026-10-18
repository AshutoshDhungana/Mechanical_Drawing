# VertGate web

This is the React + Vite + TypeScript port of `Vertical-Lift-Gate.xlsm`. See `../docs/01-workbook-findings.md` for the plan.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest: calc modules vs the workbook's saved values (../data/golden)
npm run build
```

## Layout

- `src/calc/` holds pure calculation modules, one per workbook sheet. They have no React code, use SI units, and each has a `*.test.ts` that checks it against `data/golden/workbook.json`.
  - `project.ts`: Summary sheet inputs and derived levels.
  - `beamSpacing.ts`: Beam Spacing sheet plus the `BeamSpace` VBA solvers.
  - `defineBeam.ts`, `secProp.ts`, `stress.ts`, `stiffeners.ts`: those sheets; `structure.ts` runs them in dependency order.
  - `seals.ts`, `wheelSpacing.ts` (reuses the Beam Spacing solvers), `wheelDesign.ts` (also the hidden Wheel Design IS sheet).
  - `downpull.ts`, `weight.ts` (Weight & cg), `operation.ts` (hoist loads over the opening).
  - `hoist.ts` (Hoist(Rope Drum) + legacy Rope Drum Hoist), `embedded.ts` (Embedded Parts + legacy Embedded), `summary.ts`.
  - `golden.ts`: test helper that reads the saved workbook values.
- `src/ui/` holds the views (`StructureViews.tsx`, `WheelViews.tsx`, `OpsViews.tsx`, `ReportViews.tsx`) and shared components (number field, beam diagram). `Sketches.tsx` redraws the workbook's explanatory sketches as SVG with live values; `sketches.test.tsx` renders each one.
- `src/designFile.ts` saves every input as a JSON design file (**Save design** / **Open design** in the header). A loaded file is checked field by field against the default design's types before anything reaches the calculation; fields missing from an older file take the defaults. The **Report** tab shows the Summary, then every sheet with its inputs (read-only), results and sketches; **Print / PDF** prints it on A4. A tab can be opened directly with `#<tab name>` in the URL (e.g. `#Report`).
- `src/drawing/` holds the scaled drawings: `model.ts` builds the gate geometry in mm from the calc results (elevation, sections A-A, B-B, C-C and the detail windows); `sheet.ts` places the views on an ISO A0–A3 sheet at a standard scale and turns them into paper primitives (hatching, dimensions, notes, frame, title block, schedule); `dxf.ts` writes those primitives as an AutoCAD R12 DXF. `ui/DrawingView.tsx` draws the same primitives as SVG (zoom, pan, layers, SVG download, Print / PDF via the browser at the sheet size).
- `src/App.tsx` is the screen.

## Where the port differs from the workbook (on purpose)

| Workbook | Port | Why |
|---|---|---|
| Skin-plate moments: 11 fixed Gauss-Seidel sweeps of the three-moment equation (cols R–AC) | Exact tridiagonal solve | The sweeps can stop short of convergence for large N. On the saved design the two agree to 7e-11. |
| `Accuracy` rounding uses a `Single`-precision step and can loop forever if the spacings overshoot | Rounds in whole steps; never loops | Same result, without drift or a hang |
| Manual spacings: the macro writes D/n defaults, then the user edits cells | Editable spacing column; no rounding applied | Same behaviour |
| Pressure formula gives `#NUM!` above the water surface | Pressure 0 above the surface, plus a warning | Physical value |
| Moment helper grid AE–AW gives `#DIV/0!` | Not ported | Stale paste; nothing reads it |
| D, Lsup, HB, Hp are formulas in input cells that users overwrite | Linked to project inputs until edited, with a reset button | Same defaults, and the override is visible |

The Define Beam / SecProp / Stress / Stiffeners port fixes eight spreadsheet slips and flags eight formula questions for the engineer. The Seals / Wheel Spacing / Wheel Design port fixes eight more and flags six; Downpull / Weight & cg / Operation fixes three and flags three; the hoist, embedded parts and Summary fix six and flag ten. All the lists are in `../docs/01-workbook-findings.md` §6.1–§6.4. Lines marked `ponytail:` in `src/calc/` show where a flagged formula is kept as the workbook has it.
