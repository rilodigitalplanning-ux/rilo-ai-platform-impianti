import type { Zone, ZoneResult, ProjectResult, LoadProject } from '../types';
import {
  LIGHTING_COEFFICIENTS,
  POWER_COEFFICIENTS,
  HVAC_THERMAL_COEFFICIENTS,
  CLIMATE_CORRECTION,
  AVERAGE_COP,
  SIMULTANEITY_FACTORS,
} from '../constants/coefficients';

export function calculateZone(zone: Zone, project: LoadProject): ZoneResult {
  const q = project.qualityLevel;
  const climateFactor = CLIMATE_CORRECTION[project.climateZone];

  const lightingCoeff = LIGHTING_COEFFICIENTS[zone.usage][q];
  const powerCoeff = POWER_COEFFICIENTS[zone.usage][q];
  const hvacThermalCoeff = HVAC_THERMAL_COEFFICIENTS[zone.usage] * climateFactor;
  const hvacCoeff = hvacThermalCoeff / AVERAGE_COP;
  const sf = SIMULTANEITY_FACTORS[zone.usage];

  const lightingInstalled = (lightingCoeff * zone.area) / 1000;
  const powerOutletsInstalled = (powerCoeff * zone.area) / 1000;
  const hvacInstalled = (hvacCoeff * zone.area) / 1000;
  const specialInstalled = zone.specialLoads.reduce(
    (sum, s) => sum + s.power * s.quantity, 0
  );
  const totalInstalled = lightingInstalled + powerOutletsInstalled + hvacInstalled + specialInstalled;

  const lightingDemand = lightingInstalled * sf;
  const powerOutletsDemand = powerOutletsInstalled * sf;
  const hvacDemand = hvacInstalled * sf;
  const specialDemand = specialInstalled * 0.85;
  const totalDemand = lightingDemand + powerOutletsDemand + hvacDemand + specialDemand;

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    usage: zone.usage,
    area: zone.area,
    lightingInstalled, powerOutletsInstalled, hvacInstalled, specialInstalled, totalInstalled,
    lightingDemand, powerOutletsDemand, hvacDemand, specialDemand, totalDemand,
    lightingCoeff, powerCoeff, hvacCoeff, simultaneityFactor: sf,
  };
}

export function calculateProject(project: LoadProject): ProjectResult {
  const zones = project.zones.map(z => calculateZone(z, project));

  const totalInstalledKw = zones.reduce((s, z) => s + z.totalInstalled, 0);
  const totalDemandKw = zones.reduce((s, z) => s + z.totalDemand, 0);
  const powerFactor = 0.9;
  const totalInstalledKva = totalInstalledKw / powerFactor;
  const totalDemandKva = totalDemandKw / powerFactor;

  const methodology = generateMethodologyText(project, zones);

  return {
    projectId: project.id,
    calculatedAt: new Date().toISOString(),
    zones,
    totalInstalledKw,
    totalDemandKw,
    totalInstalledKva,
    totalDemandKva,
    powerFactor,
    methodology,
  };
}

function generateMethodologyText(project: LoadProject, zones: ZoneResult[]): string {
  const totalInstalled = zones.reduce((s, z) => s + z.totalInstalled, 0);
  const totalDemand = zones.reduce((s, z) => s + z.totalDemand, 0);

  return `METODOLOGIA DI CALCOLO — ${project.name}

RIFERIMENTI NORMATIVI
• EN 12464-1:2021 — Illuminazione dei luoghi di lavoro
• CEI 64-8/1-7 (2021) — Impianti elettrici utilizzatori
• UNI/TS 11300-1 (2014) — Prestazione energetica degli edifici
• Guida CEI 0-2 — Fattori di utilizzo e contemporaneità

METODOLOGIA GENERALE
La stima della potenza elettrica necessaria è stata effettuata con metodo parametrico per unità di superficie (W/m²), applicando coefficienti specifici per destinazione d'uso e livello qualitativo «${project.qualityLevel}».

CATEGORIE DI CARICO
1. ILLUMINAZIONE: calcolata applicando coefficienti W/m² per destinazione d'uso (EN 12464-1).
2. PRESE E UTILIZZO GENERICO: stima del carico di prese, apparecchiature e forza motrice distribuita, espressa in VA/m² secondo CEI 64-8.
3. HVAC (CONDIZIONAMENTO): il fabbisogno termico è stimato in W/m² per zona climatica ${project.climateZone} (fattore correttivo ${CLIMATE_CORRECTION[project.climateZone]}), convertito in potenza elettrica applicando un COP medio ponderato di ${AVERAGE_COP}.
4. CARICHI SPECIALI: apparecchiature di processo e altri carichi specifici dichiarati esplicitamente.

FATTORI DI CONTEMPORANEITÀ
La potenza di domanda (demand) è ottenuta applicando a ciascuna zona il fattore di contemporaneità specifico per destinazione d'uso (CEI 64-8).

RISULTATI
Potenza totale installata: ${totalInstalled.toFixed(1)} kW
Potenza di domanda: ${totalDemand.toFixed(1)} kW
Potenza di domanda (kVA, cosφ=0.9): ${(totalDemand / 0.9).toFixed(1)} kVA

AVVERTENZE
I valori ottenuti sono stime parametriche da utilizzare esclusivamente in fase di pre-dimensionamento.`;
}
