export interface ConversionStats {
  fileName: string;
  pages: number;
  entities: number;
  layers: number;
  warnings: string[];
}

export interface ConversionResult {
  stats: ConversionStats;
  dxfText: string;
}
