export type EnvelopeType =
  | 'muratura_pesante'
  | 'muratura_leggera'
  | 'curtain_wall_vetro'
  | 'capannone_industriale'
  | 'misto';

export type HvacMode = 'parametrico' | 'componenti';

export interface HvacHeatPump {
  id: string;
  label: string;
  thermalKw: number;
  cop: number;
  quantity: number;
}

export interface HvacAhu {
  id: string;
  label: string;
  flowM3h: number;
  pressurePa: number;
  efficiency: number;
  quantity: number;
}

export interface HvacPump {
  id: string;
  label: string;
  flowM3h: number;
  headM: number;
  efficiency: number;
  quantity: number;
}

export interface HvacEquipment {
  heatPumps: HvacHeatPump[];
  ahus: HvacAhu[];
  pumps: HvacPump[];
  boilerKwThermal?: number;
}

export type BuildingType =
  | 'residenziale'
  | 'uffici'
  | 'commerciale'
  | 'industriale'
  | 'alberghiero'
  | 'ospedaliero'
  | 'scolastico'
  | 'misto';

export type QualityLevel = 'base' | 'standard' | 'premium';

export type ClimateZone = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type ZoneUsage =
  | 'ufficio_open_space'
  | 'ufficio_chiuso'
  | 'sala_riunioni'
  | 'reception'
  | 'corridoio'
  | 'bagno'
  | 'archivio'
  | 'server_room'
  | 'cucina_industriale'
  | 'mensa'
  | 'negozio'
  | 'magazzino'
  | 'parcheggio'
  | 'appartamento'
  | 'camera_hotel'
  | 'lobby_hotel'
  | 'aula'
  | 'laboratorio'
  | 'palestra'
  | 'altro';

export interface Zone {
  id: string;
  name: string;
  usage: ZoneUsage;
  area: number;        // m²
  height: number;      // m
  floor: number;
  specialLoads: SpecialLoad[];
}

export interface SpecialLoad {
  id: string;
  description: string;
  power: number;       // kW
  quantity: number;
}

export interface ZoneResult {
  zoneId: string;
  zoneName: string;
  usage: ZoneUsage;
  area: number;
  lightingInstalled: number;
  powerOutletsInstalled: number;
  hvacInstalled: number;
  specialInstalled: number;
  totalInstalled: number;
  lightingDemand: number;
  powerOutletsDemand: number;
  hvacDemand: number;
  specialDemand: number;
  totalDemand: number;
  lightingCoeff: number;
  powerCoeff: number;
  hvacCoeff: number;
  simultaneityFactor: number;
}

export interface ProjectResult {
  projectId: string;
  calculatedAt: string;
  zones: ZoneResult[];
  totalInstalledKw: number;
  totalDemandKw: number;
  totalInstalledKva: number;
  totalDemandKva: number;
  powerFactor: number;
  methodology: string;
  lightingResult?: import('./utils/lightingCalculator').LightingCalculationResult;
  hvacResult?: import('./utils/hvacCalculator').HvacCalculationResult;
}

export interface LoadProject {
  id: string;
  name: string;
  client: string;
  buildingType: BuildingType;
  qualityLevel: QualityLevel;
  climateZone: ClimateZone;
  envelopeType: EnvelopeType;
  hvacMode: HvacMode;
  hvacEquipment: HvacEquipment;
  zones: Zone[];
  result?: ProjectResult;
  createdAt: string;
  updatedAt: string;
}
