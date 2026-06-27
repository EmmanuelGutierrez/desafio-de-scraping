/**
 * types.ts
 * Tipos e interfaces usados en todo el scraper.
 */

/** Sectores disponibles en el filtro del buscador */
export type Sector =
  | "null"   // (todos)
  | "2"      // Energía
  | "3"      // Minería
  | "9"      // Pesquería
  | "1"      // Industria
  | "8";     // Otro

/** Parámetros opcionales para la búsqueda */
export interface SearchFilters {
  expediente?: string;
  administrado?: string;
  unidadFiscalizable?: string;
  sector?: Sector;
  nroResolucionApelacion?: string;
}

/** Datos extraídos de una fila de la tabla de resultados */
export interface ResolucionRow {
  /** Índice de fila dentro de la página (para construir el selector JSF) */
  rowIndex: number;
  /** Número de expediente */
  expediente: string;
  /** Administrado (empresa o persona) */
  administrado: string;
  /** Unidad fiscalizable */
  unidadFiscalizable: string;
  /** Sector */
  sector: string;
  /** Número de resolución de apelación */
  nroResolucionApelacion: string;
  /** Fecha (si está disponible) */
  fecha: string;
  /** UUID del documento extraído del onclick del botón PDF */
  uuid: string | null;
  /** ID del elemento JSF para el trigger de descarga */
  jsfElementId: string | null;
  /** Nombre de archivo sugerido para el PDF */
  fileName: string;
}

/** Resultado de intentar descargar un PDF */
export interface DownloadResult {
  row: ResolucionRow;
  success: boolean;
  filePath?: string;
  error?: string;
  skipped?: boolean;
}

/** Estado global del scraper para logging y reintentos */
export interface ScraperState {
  totalRows: number;
  processedRows: number;
  downloadedPdfs: number;
  failedDownloads: ResolucionRow[];
  currentPage: number;
  totalPages: number;
}
