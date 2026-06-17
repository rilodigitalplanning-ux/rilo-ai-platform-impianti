import type { Zone, QualityLevel, ZoneUsage } from '../types';
import {
  ETA, UF_DELTA, UF_MIN, UF_MAX, MF, DAYLIGHT_FACTOR,
  EM_TARGET, UF_NOMINAL, SAFETY_LIGHTING_FACTOR,
  type Scenario,
} from '../constants/lightingCoefficients';

export type { Scenario };

export interface ScenarioValues {
  ottimistico: number;
  probabile: number;
  pessimistico: number;
}

export interface ZoneLightingResult {
  zoneId: string;
  zoneName: string;
  usage: ZoneUsage;
  area: number;
  height: number;
  Em: number;
  UF_nominal: number;
  RCR: number;
  UF_effective: number;
  rcrCorrected: boolean;
  lpd: ScenarioValues; // W/m²
  power: ScenarioValues; // W
}

export interface LightingCalculationResult {
  zones: ZoneLightingResult[];
  subtotal: ScenarioValues; // kW ante sicurezza
  safetyLighting: ScenarioValues; // kW
  total: ScenarioValues; // kW finale
  avgLpd: ScenarioValues; // W/m²
  totalArea: number;
  quality: QualityLevel;
}

// RCR = 10 × h_r / √A  (h_r = altezza utile ≈ h - 0.5m)
// Valido per ambienti approssimativamente quadrangolari
function calcRCR(area: number, height: number): number {
  if (area <= 0 || height <= 0) return 0;
  const h_r = Math.max(height - 0.5, 1);
  return (10 * h_r) / Math.sqrt(area);
}

// Fattore correttivo UF in funzione del RCR
function rcrUfFactor(rcr: number): number {
  if (rcr < 3)  return 1.00;
  if (rcr < 5)  return 0.92;
  if (rcr < 7)  return 0.82;
  if (rcr < 10) return 0.72;
  return 0.62;
}

// LPD = Em / (UF_scenario × MF) / η × daylight_factor  [W/m²]
function calcLPD(
  Em: number,
  UF_eff: number,
  scenario: Scenario,
  quality: QualityLevel,
): number {
  const UF_s = Math.min(Math.max(UF_eff + UF_DELTA[scenario], UF_MIN), UF_MAX);
  return (Em / (UF_s * MF[scenario][quality]) / ETA[scenario][quality]) * DAYLIGHT_FACTOR[scenario][quality];
}

export function calculateZoneLighting(zone: Zone, quality: QualityLevel): ZoneLightingResult {
  const Em = EM_TARGET[zone.usage];
  const UF_nom = UF_NOMINAL[zone.usage];
  const rcr = calcRCR(zone.area, zone.height);
  const UF_eff = UF_nom * rcrUfFactor(rcr);

  const scenarios: Scenario[] = ['ottimistico', 'probabile', 'pessimistico'];
  const lpd = {} as ScenarioValues;
  const power = {} as ScenarioValues;

  for (const s of scenarios) {
    lpd[s] = calcLPD(Em, UF_eff, s, quality);
    power[s] = lpd[s] * zone.area;
  }

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    usage: zone.usage,
    area: zone.area,
    height: zone.height,
    Em,
    UF_nominal: UF_nom,
    RCR: Math.round(rcr * 10) / 10,
    UF_effective: Math.round(UF_eff * 100) / 100,
    rcrCorrected: rcrUfFactor(rcr) < 1.0,
    lpd,
    power,
  };
}

export function calculateLighting(
  zones: Zone[],
  quality: QualityLevel,
  includeSafetyLighting = true,
): LightingCalculationResult {
  const zoneResults = zones
    .filter(z => z.area > 0)
    .map(z => calculateZoneLighting(z, quality));

  const totalArea = zoneResults.reduce((s, z) => s + z.area, 0);
  const scenarios: Scenario[] = ['ottimistico', 'probabile', 'pessimistico'];

  const subtotal = {} as ScenarioValues;
  const safetyLighting = {} as ScenarioValues;
  const total = {} as ScenarioValues;
  const avgLpd = {} as ScenarioValues;

  for (const s of scenarios) {
    const sumW = zoneResults.reduce((acc, z) => acc + z.power[s], 0);
    const sumKw = sumW / 1000;
    const safety = includeSafetyLighting ? sumKw * SAFETY_LIGHTING_FACTOR : 0;
    subtotal[s] = sumKw;
    safetyLighting[s] = safety;
    total[s] = sumKw + safety;
    avgLpd[s] = totalArea > 0 ? sumW / totalArea : 0;
  }

  return { zones: zoneResults, subtotal, safetyLighting, total, avgLpd, totalArea, quality };
}
