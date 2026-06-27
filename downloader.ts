/**
 * downloader.ts
 * Descarga PDFs usando el trigger JSF (mojarra) que activa el botón de descarga.
 * Maneja reintentos, 429, y registro de fallos.
 */

import * as fs from "fs";
import * as path from "path";
import { HttpClient, SEARCH_PATH, BASE_URL } from "./http";
import { ResolucionRow, DownloadResult } from "./types";
import { logger } from "./logger";
import { isPdf } from "./utils/isPdf";

const FORM_ID = "listarDetalleInfraccionRAAForm";
const PDF_DIR = path.join(process.cwd(), "pdfs");

export class PdfDownloader {
  private failedRows: ResolucionRow[] = [];

  constructor(private http: HttpClient) {
    if (!fs.existsSync(PDF_DIR)) {
      fs.mkdirSync(PDF_DIR, { recursive: true });
    }
  }

  /**
   * Descarga el PDF de una fila.
   * Estrategia:
   *   1. Si hay UUID → intenta URL directa por UUID
   *   2. Si hay jsfElementId → trigger JSF (mojarra)
   *   3. Registra como fallido si ambas fallan
   */
  async downloadRow(row: ResolucionRow): Promise<DownloadResult> {
    const filePath = path.join(PDF_DIR, row.fileName);

    // Saltar si ya fue descargado
    if (fs.existsSync(filePath)) {
      logger.debug(`[download] Ya existe: ${row.fileName}`);
      return { row, success: true, filePath, skipped: true };
    }

    logger.info(`[download] Descargando: ${row.fileName}`);

    // ── Intento 1: URL directa por UUID ────────────────────────────────────
    // if (row.uuid) {
    //   const buffer = await this.tryUuidDownload(row.uuid);
    //   if (buffer) {
    //     fs.writeFileSync(filePath, buffer);
    //     logger.success(`[download] ✓ UUID: ${row.fileName}`);
    //     return { row, success: true, filePath };
    //   }
    // }

    // ── Intento 2: Trigger JSF (mojarra) ───────────────────────────────────
    if (row.jsfElementId) {
      const buffer = await this.tryJsfDownload(row);
      console.log('buffer', buffer);
      if (buffer) {
        fs.writeFileSync(filePath, buffer);
        logger.success(`[download] ✓ JSF: ${row.fileName}`);
        return { row, success: true, filePath };
      }
    }

    // ── Fallido ─────────────────────────────────────────────────────────────
    logger.error(`[download] ✗ Falló: ${row.fileName}`);
    this.failedRows.push(row);
    return {
      row,
      success: false,
      error: "No se pudo descargar por ningún método disponible",
    };
  }

  /**
   * Intenta descargar el PDF usando la URL construida con el UUID.
   * Prueba varios patrones de URL comunes en portales JSF del Estado peruano.
   */
  private async tryUuidDownload(uuid: string): Promise<Buffer | null> {
    const candidateUrls = [
      `${BASE_URL}/repdig/descarga/pdf/${uuid}`,
      `${BASE_URL}/repdig/consulta/downloadPdf?uuid=${uuid}`,
      `${BASE_URL}/repdig/consulta/consultaTfa/pdf/${uuid}`,
      `${BASE_URL}/repdig/pdf/${uuid}`,
    ];

    for (const url of candidateUrls) {
      logger.debug(`[download] Probando URL: ${url}`);
      const buffer = await this.http.downloadBinary(url);
      if (buffer && isPdf(buffer)) {
        return buffer;
      }
    }

    return null;
  }

  /**
   * Dispara el evento JSF (mojarra.jsfcljs) que activa la descarga del PDF.
   * Replica exactamente el onclick del botón en la tabla.
   */
  private async tryJsfDownload(row: ResolucionRow): Promise<Buffer | null> {
    const pageRowIndex = row.rowIndex % 10; // ← índice dentro de la página
    const elementId = `${FORM_ID}:dt:${pageRowIndex}:j_idt63`;

    const payload = new URLSearchParams({
      [FORM_ID]: FORM_ID,
      [`${FORM_ID}:txtNroexp`]: "",
      [`${FORM_ID}:j_idt21`]: "",
      [`${FORM_ID}:j_idt25`]: "",
      [`${FORM_ID}:idsector`]: "",
      [`${FORM_ID}:j_idt34`]: "",
      [`${FORM_ID}:dt_scrollState`]: "0,0",
      "javax.faces.ViewState": this.http.getViewState(),
      [elementId]: elementId,
      param_uuid: row.uuid ?? "",
    });

    return this.http.postBinary(SEARCH_PATH, payload);
  }

  /**
   * Reintentar todos los documentos que fallaron.
   */
  async retryFailed(): Promise<DownloadResult[]> {
    if (this.failedRows.length === 0) return [];

    logger.info(
      `[retry] Reintentando ${this.failedRows.length} documentos fallidos`,
    );
    const toRetry = [...this.failedRows];
    this.failedRows = [];

    const results: DownloadResult[] = [];
    for (const row of toRetry) {
      await this.http.delay(2000); // delay mayor para reintentos
      results.push(await this.downloadRow(row));
    }
    return results;
  }

  getFailedRows(): ResolucionRow[] {
    return this.failedRows;
  }
}

