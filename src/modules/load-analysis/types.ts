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
}

export interface LoadProject {
  id: string;
  name: string;
  client: string;
  buildingType: BuildingType;
  qualityLevel: QualityLevel;
  climateZone: ClimateZone;
  zones: Zone[];
  result?: ProjectResult;
  createdAt: string;
  updatedAt: string;
}
