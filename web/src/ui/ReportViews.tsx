import { rolledSections } from '../calc/defineBeam'
import { ropeDiameters, type GearType, type HoistInput, type HoistResult, type legacyHoist, type Material, type RopeCore, type RopeGrade } from '../calc/hoist'
import { beamSections, boltSizes, channelSections, type EmbeddedInput, type EmbeddedResult, type legacyEmbedded } from '../calc/embedded'
import type { SummarySection } from '../calc/summary'
import { NumberField, SelectField } from './NumberField'
import { Checks, Fields, type Spec } from './WheelViews'
import { f } from './format'

// ---------------------------------------------------------------- Hoist

const matSpec: Spec<Material>[] = [['uts', 'Ultimate tensile stress', 'MPa'], ['yield', 'Yield stress', 'MPa']]

export function HoistInputs({ value: h, onChange, liftHeightDefault, source, onSource }: {
  value: HoistInput; onChange: (h: HoistInput) => void; liftHeightDefault: number; source: string; onSource: (s: string) => void
}) {
  const set = <K extends keyof HoistInput>(k: K) => (v: HoistInput[K]) => onChange({ ...h, [k]: v })
  return (
    <>
      <section className="card">
        <h2>Load and rope</h2>
        <NumberField label="Hoist lifting load" hint="jammed condition; the workbook holds 118" unit="kN" min={0} value={h.liftingLoad} onChange={set('liftingLoad')} />
        <NumberField label="Lifting height" hint="hoist deck − gate height − sill" unit="m" min={0} value={h.liftHeight ?? liftHeightDefault}
          linked={h.liftHeight === null} onChange={set('liftHeight')} onRelink={() => set('liftHeight')(null)} />
        <Fields value={h} spec={[['drums', 'Number of drums'], ['fallsPerDrum', 'Rope falls per drum'], ['pulleyEff', 'Efficiency of gate pulley'],
          ['drumPcd', 'Drum PCD', 'mm'], ['speed', 'Lifting speed', 'm/min']] as Spec<HoistInput>[]} onChange={onChange} />
        <SelectField label="Rope grade" value={String(h.grade)} options={['1570', '1770', '1960']} onChange={(v) => set('grade')(Number(v) as RopeGrade)} hint="N/mm²" />
        <SelectField label="Rope core" value={h.core} options={['Fibre Core(CF)', 'Wire Rope Core(CWR)'] as RopeCore[]} onChange={set('core')} />
        <SelectField label="Rope diameter" value={String(h.ropeD)} options={ropeDiameters.map(String)} onChange={(v) => set('ropeD')(Number(v))} hint="mm" />
      </section>
      <section className="card">
        <h2>Motor, worm reducer, gears</h2>
        <NumberField label="Worm efficiency, starting" min={0.01} max={1} value={h.wormEff[0]} onChange={(v) => set('wormEff')([v, h.wormEff[1]])} />
        <NumberField label="Worm efficiency, running" min={0.01} max={1} value={h.wormEff[1]} onChange={(v) => set('wormEff')([h.wormEff[0], v])} />
        <Fields value={h.motor} spec={[['power', 'Motor rated power', 'HP', 'as used by 71620·P/n'], ['rpm', 'Motor rated speed', 'rpm']]} onChange={set('motor')} />
        <Fields value={h.worm} spec={[['ratio', 'Worm reduction ratio'], ['inputHP', 'Reducer input power', 'HP'], ['inputRpm', 'Reducer input speed', 'rpm'],
          ['outputTorque', 'Reducer output torque', 'N·m']]} onChange={set('worm')} />
        <SelectField label="Gear type" value={h.gearType} options={['20 Deg Full Depth Involute', '20 Deg Stub Tooth'] as GearType[]} onChange={set('gearType')} />
        <Fields value={h.teeth} spec={[['drumGear', 'Drum gear teeth'], ['drumPinion', 'Drum pinion teeth'], ['gear2', '2nd gear teeth'], ['pinion2', '2nd pinion teeth']]}
          onChange={set('teeth')} />
        <Fields value={h.modules} spec={[['drum', 'Module, drum gear set', 'mm'], ['second', 'Module, 2nd gear set', 'mm']]} onChange={set('modules')} />
        <Fields value={h.gearMat} spec={matSpec.map(([k, l, u]) => [k, `Gear ${l.toLowerCase()}`, u])} onChange={set('gearMat')} />
        <Fields value={h.pinionMat} spec={matSpec.map(([k, l, u]) => [k, `Pinion ${l.toLowerCase()}`, u])} onChange={set('pinionMat')} />
      </section>
      <section className="card">
        <h2>Drum and shafts</h2>
        <SelectField label="Drum material" value={h.drum.name} options={['Cast Steel', 'Mild Steel', 'Cast Iron']} onChange={(name) => set('drum')({ ...h.drum, name })} />
        <Fields value={h.drum} spec={[...matSpec, ['shell', 'Drum shell thickness', 'mm'], ['length', 'Adopted drum length', 'm']]} onChange={set('drum')} />
        <Fields value={h.shaft} spec={[['d', 'Drum shaft diameter', 'm'], ['AC', 'Bearing A to C', 'mm'], ['BD', 'Bearing B to D', 'mm'], ['plate', 'Support plate thickness', 'mm']]}
          onChange={set('shaft')} />
        <Fields value={h.shaft.material} spec={matSpec.map(([k, l, u]) => [k, `Shaft ${l.toLowerCase()}`, u])} onChange={(material) => set('shaft')({ ...h.shaft, material })} />
        <Fields value={h.shaft2} spec={[['d', '2nd shaft diameter', 'm'], ['PQ', 'Pinion to 2nd gear', 'm'], ['XY', '2nd shaft length', 'm']]} onChange={set('shaft2')} />
      </section>
      <section className="card">
        <h2>Manual operation and supply</h2>
        <Fields value={h.manual} spec={[['handleR', 'Handle radius', 'm'], ['handleRpm', 'Handle speed', 'rpm'], ['sprocket', 'Sprocket ratio'],
          ['sprocketEff', 'Sprocket efficiency'], ['personForce', 'Average force of a person', 'N']]} onChange={set('manual')} />
        <label className="field">
          <span className="field-label">Electric source</span>
          <span className="field-input"><input value={source} onChange={(e) => onSource(e.target.value)} /></span>
        </label>
      </section>
    </>
  )
}

export function HoistView({ r, h }: { r: HoistResult; h: HoistInput }) {
  const d = r.drum, s = r.shaft
  return (
    <>
      <div className="stats">
        <div><span>Rope tension</span><strong>{f(r.ropeTension, 1)}</strong><small>kN ({h.ropeD} mm rope, {f(r.mbf, 0)} kN breaking)</small></div>
        <div><span>Motor power needed</span><strong>{f(r.hp, 2)}</strong><small>HP (rated {h.motor.power})</small></div>
        <div><span>Lifting speed</span><strong>{f(r.liftSpeed, 3)}</strong><small>m/min (target {h.speed})</small></div>
      </div>
      <Checks title="Rope" rows={[
        ['Max lifting load (Operation)', 'kN', r.maxLift, undefined, 2], ['Jammed condition, 2.5 × max', 'kN', r.jammed, undefined, 2],
        ['Rope tension, normal', 'kN', r.ropeTension, undefined, 2], ['Factor of safety, normal', '', r.fos, r.fosRequired, 2, true],
        ['Rope tension under breakdown torque', 'kN', r.ropeTensionBDT, undefined, 2], ['Factor of safety, BDT', '', r.fosBDT, r.fosBDTRequired, 2, true],
      ]} />
      <Checks title="Motor, brake and gear train" rows={[
        ['Overall efficiency, starting', '', r.effStart], ['Overall efficiency, running', '', r.effRun], ['Power needed', 'HP', r.hp, h.motor.power, 2],
        ['Reducer torque at rated power', 'N·m', r.torqueAtRated, undefined, 1], ['Reducer torque at power needed', 'N·m', r.torqueAtNeed, undefined, 1],
        ['Total reduction', '', r.reduction, undefined, 2], ['Drum speed', 'rpm', r.drumRpm, undefined, 4],
        ['Rated motor torque', 'N·m', r.ratedTorque, undefined, 2], ['Brake torque (1.5 × rated)', 'N·m', r.brakeTorque, undefined, 2],
        ['Breakdown torque (2.9 × rated)', 'N·m', r.bdt, undefined, 2], ['Torque on drum under BDT', 'N·m', r.drumTorqueBDT, undefined, 0],
      ]} note="Drum speed uses 960 rpm, as the workbook does, not the motor's rated speed (flagged for the engineer)." />
      <Checks title="Rope drum" rows={[
        ['Groove pitch', 'mm', d.pitch, undefined, 1], ['Rope wound on drum', 'm', d.ropeLen, undefined, 2],
        ['Grooves for the lift', '', d.grooves, undefined, 0], ['Total grooves (with fixing and idle)', '', d.totalGrooves, undefined, 0],
        ['Grooved length', 'm', d.groovedLength, h.drum.length, 3], ['Drum weight', 'kg', d.kg, undefined, 1],
        ['Crushing stress, normal', 'MPa', d.crushN, d.crushAllowN, 1], ['Crushing stress, BDT', 'MPa', d.crushB, d.crushAllowB, 1],
        ['Bending stress', 'MPa', d.bending, undefined, 2], ['Combined stress', 'MPa', d.combined, d.combinedAllow, 1],
      ]} />
      <div className="card table-wrap">
        <h2>Gears and pinions</h2>
        <table>
          <thead><tr><th>Part</th><th>Teeth</th><th>Module<small>mm</small></th><th>PCD<small>m</small></th><th>Face<small>mm</small></th><th>q</th>
            <th>Torque N / BDT<small>kN·m</small></th><th>Tooth load N / BDT<small>kN</small></th><th>Stress N / BDT<small>MPa</small></th><th>Allowable N / BDT<small>MPa</small></th></tr></thead>
          <tbody>
            {r.gears.map((g) => (
              <tr key={g.part}>
                <th scope="row">{g.part}</th><td>{g.teeth}</td><td>{g.module}</td><td>{f(g.pcd, 3)}</td><td>{g.face}</td><td>{f(g.q, 3)}</td>
                <td>{f(g.torque[0], 4)} / {f(g.torque[1], 4)}</td><td>{f(g.toothLoad[0], 2)} / {f(g.toothLoad[1], 2)}</td>
                <td className={`ratio ${g.stress.some((x, i) => x >= g.allow[i]) ? 'fail' : 'ok'}`}>{f(g.stress[0], 1)} / {f(g.stress[1], 1)}</td>
                <td>{f(g.allow[0], 0)} / {f(g.allow[1], 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">The torque chain and tooth loads follow the workbook's formulas, which are flagged for the engineer (findings §6.4).</p>
      </div>
      <Checks title="Drum shaft" rows={[
        ['Max bending moment at B, normal', 'N·m', s.bmB[0], undefined, 0], ['BDT', 'N·m', s.bmB[1], undefined, 0],
        ['Bending stress, normal', 'MPa', s.fbN, s.fbNAllow, 1], ['Bending stress, BDT', 'MPa', s.fbB, s.fbBAllow, 1],
        ['Bearing stress on support plate', 'MPa', s.bearing, s.bearingAllow, 1], ['Shear stress', 'MPa', s.shear, s.shearAllow, 1],
      ]} />
      <Checks title="Second shaft reactions" rows={[
        ['RX, normal', 'N', r.shaft2.RX[0], undefined, 0], ['RX, BDT', 'N', r.shaft2.RX[1], undefined, 0],
        ['RY, normal', 'N', r.shaft2.RY[0], undefined, 0], ['RY, BDT', 'N', r.shaft2.RY[1], undefined, 0],
      ]} />
      <Checks title="Manual operation" rows={[
        ['Manual lifting speed', 'm/min', r.manual.speed, undefined, 4], ['Handle effort', 'N', r.manual.effort, h.manual.personForce, 1],
        ['People required', '', r.manual.people, undefined, 0],
      ]} />
    </>
  )
}

// ---------------------------------------------------------------- Embedded parts

export function EmbeddedInputs({ value: e, onChange, sealPlate, onSealPlate }: {
  value: EmbeddedInput; onChange: (e: EmbeddedInput) => void; sealPlate: number; onSealPlate: (v: number) => void
}) {
  const set = <K extends keyof EmbeddedInput>(k: K) => (v: EmbeddedInput[K]) => onChange({ ...e, [k]: v })
  return (
    <>
      <section className="card">
        <h2>Sections</h2>
        <SelectField label="Sill beam" value={e.sillBeam} options={rolledSections} onChange={set('sillBeam')} />
        <SelectField label="Downstream channel" value={e.channels.downstream} options={channelSections} onChange={(downstream) => set('channels')({ ...e.channels, downstream })} />
        <SelectField label="Upstream channel" value={e.channels.upstream} options={channelSections} onChange={(upstream) => set('channels')({ ...e.channels, upstream })} />
        <SelectField label="Lintel beam" value={e.channels.lintel} options={beamSections} onChange={(lintel) => set('channels')({ ...e.channels, lintel })} />
      </section>
      <section className="card">
        <h2>Plates and anchors</h2>
        <NumberField label="Seal plate thickness" hint="also sets the wheel axis position" unit="mm" min={0} value={sealPlate} onChange={onSealPlate} />
        <Fields value={e} spec={[['sealPlateWidth', 'Seal plate width', 'mm'], ['sideSealPlateT', 'Side seal plate thickness', 'mm'],
          ['sidePlateT', 'Channel supporting plate thickness', 'mm'], ['sillAnchorSpacing', 'Sill anchor spacing', 'mm'],
          ['anchorSpacing', 'Side anchor spacing', 'mm'], ['cornerOffset', 'Offset, downstream corner', 'mm']] as Spec<EmbeddedInput>[]} onChange={onChange} />
        <Fields value={e.anchorsPer} spec={[['downstream', 'Anchors per row, downstream channel'], ['upstream', 'Anchors per row, upstream channel'],
          ['plate', 'Anchors per row, side plate'], ['beam', 'Anchors per row, I beam']]} onChange={set('anchorsPer')} />
        <Fields value={e.anchor} spec={[['length', 'Anchor length', 'mm'], ['diameter', 'Anchor diameter', 'mm']]} onChange={set('anchor')} />
        <Fields value={e.sideTrack} spec={[['width', 'Side roller track width', 'mm'], ['thickness', 'Side roller track thickness', 'mm']]} onChange={set('sideTrack')} />
        <Fields value={e.sillSealPlate} spec={[['width', 'Sill seal plate width', 'mm'], ['thickness', 'Sill seal plate thickness', 'mm', 'the workbook types 80']]}
          onChange={set('sillSealPlate')} />
        <SelectField label="Bolt size" value={e.bolt.size} options={boltSizes} onChange={(size) => set('bolt')({ ...e.bolt, size })} />
        <Fields value={e.bolt} spec={[['length', 'Bolt length', 'mm'], ['lintelCount', 'Bolts on the lintel beam']]} onChange={set('bolt')} />
      </section>
    </>
  )
}

export function EmbeddedView({ r }: { r: EmbeddedResult }) {
  return (
    <>
      <div className="stats">
        <div><span>Total weight of embedded parts</span><strong>{f(r.total, 0)}</strong><small>kg (Erbisti {f(r.erbisti.min, 0)}–{f(r.erbisti.max, 0)})</small></div>
        <div><span>Niche contour M × N</span><strong>{r.niche.length} × {r.niche.depth}</strong><small>mm</small></div>
        <div><span>Slot contour L × B</span><strong>{r.slotLength} × {r.slotDepth}</strong><small>mm</small></div>
      </div>
      <Checks title="Sill beam and side plate" rows={[
        ['Gate weight', 'N', r.sillBeam.weight, undefined, 0], ['Design udl on sill beam', 'N/m', r.sillBeam.designUdl, undefined, 0],
        ['Max bending moment between anchors', 'N·m', r.sillBeam.M, undefined, 1], ['Sill beam stress', 'MPa', r.sillBeam.stress, r.sillBeam.allow, 2],
        ['Anchors along the sill beam', '', r.sillBeam.anchors, undefined, 0],
        ['Side plate width', 'mm', r.sidePlate.width, undefined, 0], ['Side plate stress', 'MPa', r.sidePlate.stress, r.sidePlate.allow, 2],
      ]} />
      <div className="card table-wrap">
        <h2>Weights</h2>
        <table>
          <thead><tr><th>Item</th><th>Number</th><th>Width<small>mm</small></th><th>Height<small>mm</small></th><th>Depth<small>mm</small></th>
            <th>Diam.<small>mm</small></th><th>Unit weight<small>kg</small></th><th>Total<small>kg</small></th></tr></thead>
          <tbody>
            {r.groups.flatMap(([title, items], g) => [
              <tr key={title} className="group-row"><th colSpan={8}>{title}</th></tr>,
              ...items.map((i, k) => (
                <tr key={`${g}-${k}`}>
                  <th scope="row">{i.name}</th><td>{f(i.count, 0)}</td><td>{i.width ?? ''}</td><td>{i.height ?? ''}</td><td>{i.depth ?? ''}</td>
                  <td>{i.diameter ?? ''}</td><td>{f(i.unit, 3)}</td><td>{f(i.total, 1)}</td>
                </tr>
              )),
              <tr key={`${title}-sub`}><th scope="row">Subtotal</th><td colSpan={6} /><td>{f(r.subtotals[g], 1)}</td></tr>,
            ])}
            <tr className="total"><th scope="row">Gross weight</th><td colSpan={6} /><td>{f(r.gross, 1)}</td></tr>
            <tr className="total"><th scope="row">Total (+10%)</th><td colSpan={6} /><td>{f(r.total, 1)}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Summary and legacy sheets

export function SummaryView({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="card table-wrap">
      <table className="props">
        {sections.map((s) => (
          <tbody key={s.title}>
            <tr className="group"><th colSpan={3}>{s.title}</th></tr>
            {s.rows.map(([label, v, unit]) => (
              <tr key={label}><th scope="row">{label}</th><td>{typeof v === 'number' ? f(v, Number.isInteger(+v.toFixed(6)) ? 0 : 3) : v ?? '—'}</td><td className="unit-cell">{unit}</td></tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

export function LegacyView({ hoist: h, embedded: e }: { hoist?: ReturnType<typeof legacyHoist>; embedded?: ReturnType<typeof legacyEmbedded> }) {
  return (
    <>
      <p className="note">
        The workbook keeps these older sheets hidden; nothing in the current design reads them except a few Summary cells (now taken from the
        current sheets). They are shown with the workbook's saved inputs for reference.
      </p>
      {h && (
        <Checks title="Rope Drum Hoist (legacy)" rows={[
          ['Design lifting load', 't', h.design, undefined, 2], ['Breaking force', 'kN', h.mbf, undefined, 0], ['Force per rope', 't', h.force, undefined, 3],
          ['Safety factor', '', h.sf, undefined, 2], ['Overall efficiency', '', h.efficiency], ['Drum speed', 'rpm', h.drumRpm, undefined, 4],
          ['Motor capacity needed', 'kW', h.motorCapacity, undefined, 3], ['Manual handle torque', '', h.manualTorque, undefined, 2],
          ['Operating force', '', h.operatingForce, undefined, 3], ['Calculated drum length', 'mm', h.drumLengthCalc, undefined, 1],
          ['Open / close time', 'min', h.openTime, undefined, 2],
        ]} />
      )}
      {e && (
        <Checks title="Embedded (legacy)" rows={[
          ["Hertz contact stress", 'MPa', e.hertz, undefined, 1], ['Slot contour length', 'mm', e.slotLength, undefined, 0],
          ['Slot contour depth', 'mm', e.slotDepth, undefined, 1], ['Niche contour length', 'mm', e.nicheLength, undefined, 1],
          ['Niche contour depth', 'mm', e.nicheDepth, undefined, 0], ['Concrete bearing stress', 'MPa', e.concreteBearing, e.concreteBearingAllow, 3],
          ['Concrete shear stress', 'MPa', e.concreteShear, e.concreteShearAllow, 3], ['Total weight', 'kg', e.total, undefined, 1],
        ]} />
      )}
    </>
  )
}
