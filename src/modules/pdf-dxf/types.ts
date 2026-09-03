export interface ConversionStats {
  fileName: string;
  pages: number;
  entities: number;
  layers: number;
  /** Numero di pagine convertite con estrazione vettoriale diretta (precisa). */
  vectorPages: number;
  /** Numero di pagine convertite con tracciamento raster/Potrace (fallback per PDF scansionati). */
  rasterPages: number;
  warnings: string[];
}

export interface ConversionResult {
  stats: ConversionStats;
  dxfText: string;
}
