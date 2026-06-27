/**
 * storage.ts
 * Guarda los datos extraídos en JSON y CSV, y registra los fallos.
 */

import * as fs from "fs";
import * as path from "path";
import { ResolucionRow, DownloadResult } from "./types";
import { logger } from "./logger";

const DATA_DIR = path.join(process.cwd(), "data");
const ROWS_JSON = path.join(DATA_DIR, "resoluciones.json");
const ROWS_CSV = path.join(DATA_DIR, "resoluciones.csv");
const FAILED = path.join(DATA_DIR, "failed_downloads.json");

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Guarda todas las filas en JSON y CSV */
export function saveRows(rows: ResolucionRow[]): void {
  ensureDataDir();

  const existing = loadSavedRows() ?? [];
  const combined = [...existing, ...rows];

  // JSON
  fs.writeFileSync(ROWS_JSON, JSON.stringify(combined, null, 2), "utf-8");
  logger.success(
    `[storage] ${combined.length} registros guardados en ${ROWS_JSON}`,
  );

  // CSV
  const headers = [
    "expediente",
    "administrado",
    "unidadFiscalizable",
    "sector",
    "nroResolucionApelacion",
    "fecha",
    "uuid",
    "fileName",
  ];
  const csvLines = [
    headers.join(","),
    ...combined.map((r) =>
      headers
        .map(
          (h) =>
            `"${String(r[h as keyof ResolucionRow] ?? "").replace(/"/g, '""')}"`,
        )
        .join(","),
    ),
  ];
  fs.writeFileSync(ROWS_CSV, csvLines.join("\n"), "utf-8");
  logger.success(`[storage] CSV guardado en ${ROWS_CSV}`);
}

/** Guarda los documentos que fallaron para reintento posterior */
export function saveFailedDownloads(failed: ResolucionRow[]): void {
  if (failed.length === 0) return;
  ensureDataDir();
  fs.writeFileSync(FAILED, JSON.stringify(failed, null, 2), "utf-8");
  logger.warn(`[storage] ${failed.length} fallos guardados en ${FAILED}`);
}

/** Carga registros previamente guardados (para reanudar una ejecución) */
export function loadSavedRows(): ResolucionRow[] | null {
  if (!fs.existsSync(ROWS_JSON)) return null;
  try {
    const raw = fs.readFileSync(ROWS_JSON, "utf-8");
    return JSON.parse(raw) as ResolucionRow[];
  } catch {
    return null;
  }
}

/** Carga los fallos guardados para reintentarlos */
export function loadFailedDownloads(): ResolucionRow[] {
  if (!fs.existsSync(FAILED)) return [];
  try {
    const raw = fs.readFileSync(FAILED, "utf-8");
    return JSON.parse(raw) as ResolucionRow[];
  } catch {
    return [];
  }
}

/** Resumen final de resultados */
export function printSummary(results: DownloadResult[]): void {
  const ok = results.filter((r) => r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info("─────────────────────────────────────────");
  logger.success(`Descargados:  ${ok}`);
  logger.info(`Omitidos:     ${skipped} (ya existían)`);
  logger.error(`Fallidos:     ${failed}`);
  logger.info("─────────────────────────────────────────");
}
