import type { Zone, LoadProject, EnvelopeType, HvacMode } from '../types';
import {
  THERMAL_LOAD_HEATING,
  THERMAL_LOAD_COOLING,
  HVAC_SCENARIO,
  CLIMATE_HEAT_FACTOR,
  CLIMATE_COOL_FACTOR,
  SERVER_ROOM_PRECISION_EER,
  boilerElecKw,
} from '../constants/hvacCoefficients';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ZoneHvacResult {
  zoneId: string;
  zoneName: string;
  area: number;
  thermalHeatingKw: Record<keyof typeof HVAC_SCENARIO, number>;
  thermalCoolingKw: Record<keyof typeof HVAC_SCENARIO, number>;
  elecHeatingKw: Record<keyof typeof HVAC_SCENARIO, number>;
  elecCoolingKw: Record<keyof typeof HVAC_SCENARIO, number>;
  designElecKw: Record<keyof typeof HVAC_SCENARIO, number>; // max(heating, cooling)
}

export interface HvacScenarioTotals {
  thermalHeatingKw: number;
  thermalCoolingKw: number;
  elecHeatingKw: number;
  elecCoolingKw: number;
  auxElecKw: number;
  installedKw: number; // design + aux
  demandKw: number;    // installed × fContemp
}

// Component-mode per-equipment result
export interface HvacComponentBreakdown {
  heatPumpsKw: number;
  ahuFansKw: number;
  pumpsKw: number;
  boilerAuxKw: number;
  totalInstalledKw: number;
  demandKw: number;
}

export interface HvacCalculationResult {
  mode: HvacMode;
  envelopeType: EnvelopeType;
  totalArea: number;
  // Parametric results (always present)
  scenarios: Record<keyof typeof HVAC_SCENARIO, HvacScenarioTotals>;
  zones: ZoneHvacResult[];
  // Component-mode result (present only when mode === 'componenti')
  componentResult?: HvacComponentBreakdown;
}

// ---------------------------------------------------------------------------
// Parametric mode
// ---------------------------------------------------------------------------

function calcParametric(zones: Zone[], project: LoadProject): {
  scenarios: Record<keyof typeof HVAC_SCENARIO, HvacScenarioTotals>;
  zoneResults: ZoneHvacResult[];
} {
  const envelope = project.envelopeType;
  const heatFactor = CLIMATE_HEAT_FACTOR[project.climateZone];
  const coolFactor = CLIMATE_COOL_FACTOR[project.climateZone];

  const scenarioKeys = Object.keys(HVAC_SCENARIO) as (keyof typeof HVAC_SCENARIO)[];

  const zoneResults: ZoneHvacResult[] = zones.map(zone => {
    const baseHeat = THERMAL_LOAD_HEATING[zone.usage][envelope];
    const baseCool = THERMAL_LOAD_COOLING[zone.usage][envelope];
    const isServerRoom = zone.usage === 'server_room';

    const thermalHeatingKw: Record<keyof typeof HVAC_SCENARIO, number> = {} as any;
    const thermalCoolingKw: Record<keyof typeof HVAC_SCENARIO, number> = {} as any;
    const elecHeatingKw: Record<keyof typeof HVAC_SCENARIO, number> = {} as any;
    const elecCoolingKw: Record<keyof typeof HVAC_SCENARIO, number> = {} as any;
    const designElecKw: Record<keyof typeof HVAC_SCENARIO, number> = {} as any;

    for (const sk of scenarioKeys) {
      const s = HVAC_SCENARIO[sk];
      const thHeat = (baseHeat * s.thermalMultiplier * heatFactor * zone.area) / 1000;
      const thCool = (baseCool * s.thermalMultiplier * coolFactor * zone.area) / 1000;

      thermalHeatingKw[sk] = thHeat;
      thermalCoolingKw[sk] = thCool;

      // Server room: dedicated precision cooling, EER fixed
      const eer = isServerRoom ? SERVER_ROOM_PRECISION_EER : s.eer;
      const eHeat = thHeat / s.cop;
      const eCool = thCool / eer;

      elecHeatingKw[sk] = eHeat;
      elecCoolingKw[sk] = eCool;
      designElecKw[sk] = Math.max(eHeat, eCool); // one system serves both
    }

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      area: zone.area,
      thermalHeatingKw,
      thermalCoolingKw,
      elecHeatingKw,
      elecCoolingKw,
      designElecKw,
    };
  });

  const scenarios = {} as Record<keyof typeof HVAC_SCENARIO, HvacScenarioTotals>;

  for (const sk of scenarioKeys) {
    const s = HVAC_SCENARIO[sk];
    const thermalHeatingKw = zoneResults.reduce((sum, z) => sum + z.thermalHeatingKw[sk], 0);
    const thermalCoolingKw = zoneResults.reduce((sum, z) => sum + z.thermalCoolingKw[sk], 0);
    const elecHeatingKw = zoneResults.reduce((sum, z) => sum + z.elecHeatingKw[sk], 0);
    const elecCoolingKw = zoneResults.reduce((sum, z) => sum + z.elecCoolingKw[sk], 0);
    const designTotal = zoneResults.reduce((sum, z) => sum + z.designElecKw[sk], 0);

    // Auxiliary (pumps + AHU fans) as % of dominant thermal load
    const dominantThermal = Math.max(thermalHeatingKw, thermalCoolingKw);
    const auxElecKw = dominantThermal * s.auxPct;

    const installedKw = designTotal + auxElecKw;
    const demandKw = installedKw * s.fContemp;

    scenarios[sk] = { thermalHeatingKw, thermalCoolingKw, elecHeatingKw, elecCoolingKw, auxElecKw, installedKw, demandKw };
  }

  return { scenarios, zoneResults };
}

// ---------------------------------------------------------------------------
// Component mode — formulas from "Calcolo elettrici per meccanici.xlsx"
// ---------------------------------------------------------------------------

function calcComponents(project: LoadProject): HvacComponentBreakdown {
  const eq = project.hvacEquipment;

  // Heat pumps/reversible: P_el = kW_th / COP × qty
  const heatPumpsKw = eq.heatPumps.reduce(
    (sum, hp) => sum + (hp.thermalKw / hp.cop) * hp.quantity, 0
  );

  // AHU fans: P = (Q [m³/h] × ΔP [Pa]) / (3_600_000 × η) × 2 ventilatori × qty
  const ahuFansKw = eq.ahus.reduce((sum, ahu) => {
    const pSingle = (ahu.flowM3h * ahu.pressurePa) / (3_600_000 * ahu.efficiency);
    return sum + pSingle * 2 * ahu.quantity;
  }, 0);

  // Circulators: P = (Q [m³/h] × H [m] × 9.81) / (3600 × η) kW × qty
  const pumpsKw = eq.pumps.reduce((sum, p) => {
    const pSingle = (p.flowM3h * p.headM * 9.81) / (3600 * p.efficiency * 1000);
    return sum + pSingle * p.quantity;
  }, 0);

  // Boiler auxiliary electrical (from lookup table)
  const boilerAuxKw = eq.boilerKwThermal ? boilerElecKw(eq.boilerKwThermal) : 0;

  const totalInstalledKw = heatPumpsKw + ahuFansKw + pumpsKw + boilerAuxKw;
  const demandKw = totalInstalledKw * 0.85;

  return { heatPumpsKw, ahuFansKw, pumpsKw, boilerAuxKw, totalInstalledKw, demandKw };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function calculateHvac(project: LoadProject): HvacCalculationResult {
  const totalArea = project.zones.reduce((s, z) => s + z.area, 0);
  const { scenarios, zoneResults } = calcParametric(project.zones, project);

  const result: HvacCalculationResult = {
    mode: project.hvacMode,
    envelopeType: project.envelopeType,
    totalArea,
    scenarios,
    zones: zoneResults,
  };

  if (project.hvacMode === 'componenti') {
    const hasComponents =
      project.hvacEquipment.heatPumps.length > 0 ||
      project.hvacEquipment.ahus.length > 0 ||
      project.hvacEquipment.pumps.length > 0 ||
      (project.hvacEquipment.boilerKwThermal ?? 0) > 0;

    if (hasComponents) {
      result.componentResult = calcComponents(project);
    }
  }

  return result;
}
