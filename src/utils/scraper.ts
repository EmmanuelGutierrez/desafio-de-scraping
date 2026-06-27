/**
 * scraper.ts
 * Lógica principal de scraping: búsqueda, paginación y extracción de filas.
 */

import { HttpClient, SEARCH_PATH } from "./http";
import { parseTableRows, parsePagination } from "./parser";
import { SearchFilters, ResolucionRow } from "../types/types";
import { logger } from "./logger";

/** Nombre del formulario principal (inferido del onclick de los botones) */
const FORM_ID = "listarDetalleInfraccionRAAForm";

export class OefaScraper {
  constructor(private http: HttpClient) {}

  /**
   * Ejecuta la búsqueda inicial y navega por todas las páginas,
   * devolviendo todas las filas encontradas.
   */
  async scrapeAllPages(
    filters: SearchFilters = {},
    onPageScraped: (rows: ResolucionRow[]) => Promise<void>, // ← callback
  ): Promise<void> {
    const firstPageHtml = await this.search(filters);
    const firstRows = parseTableRows(firstPageHtml);
    await onPageScraped(firstRows); // ← procesar inmediatamente

    const { totalPages } = parsePagination(firstPageHtml);

    for (let page = 2; page <= totalPages; page++) {
      await this.http.delay();
      const pageHtml = await this.goToPage(page);
      const pageRows = parseTableRows(pageHtml);
      await onPageScraped(pageRows); // ← procesar inmediatamente
    }
  }
  /**
   * Hace el POST de búsqueda con los filtros dados.
   * Sin filtros devuelve todos los registros.
   */
  private async search(filters: SearchFilters): Promise<string> {
    const formData: Record<string, string> = {
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": `${FORM_ID}:btnBuscar`,
      "javax.faces.partial.execute": "@all",
      "javax.faces.partial.render": `${FORM_ID}:pgLista ${FORM_ID}:txtNroexp`,
      [`${FORM_ID}:btnBuscar`]: `${FORM_ID}:btnBuscar`,
      [FORM_ID]: FORM_ID,
      [`${FORM_ID}:txtNroexp`]: filters.expediente ?? "",
      [`${FORM_ID}:j_idt21`]: filters.administrado ?? "",
      [`${FORM_ID}:j_idt25`]: filters.unidadFiscalizable ?? "",
      [`${FORM_ID}:idsector`]: filters.sector ?? "",
      [`${FORM_ID}:j_idt34`]: filters.nroResolucionApelacion ?? "",
      [`${FORM_ID}:dt_scrollState`]: "0,0",
    };
    const response = await this.http.post(SEARCH_PATH, formData);
    return typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  }

  async searchOnly() {
    await this.search({});
  }

  /**
   * Navega a una página específica de la tabla paginada.
   * JSF/PrimeFaces usa un POST con el evento de paginación.
   */
  private async goToPage(page: number): Promise<string> {
    // El índice de primera fila en PrimeFaces es (página - 1) * rowsPerPage
    // Asumimos 10 filas por página (valor más común en estos portales)
    const rowsPerPage = 10;
    const first = (page - 1) * rowsPerPage;

    const formData: Record<string, string> = {
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": `${FORM_ID}:dt`,
      "javax.faces.partial.execute": `${FORM_ID}:dt`,
      "javax.faces.partial.render": `${FORM_ID}:dt`,
      [`${FORM_ID}:dt`]: `${FORM_ID}:dt`,
      [`${FORM_ID}:dt_pagination`]: "true",
      [`${FORM_ID}:dt_first`]: String(first),
      [`${FORM_ID}:dt_rows`]: String(rowsPerPage),
      [`${FORM_ID}:dt_skipChildren`]: "true",
      [`${FORM_ID}:dt_encodeFeature`]: "true", // ← faltaba este
      [FORM_ID]: FORM_ID,
      [`${FORM_ID}:txtNroexp`]: "",
      [`${FORM_ID}:j_idt21`]: "",
      [`${FORM_ID}:j_idt25`]: "",
      [`${FORM_ID}:idsector`]: "",
      [`${FORM_ID}:j_idt34`]: "",
      [`${FORM_ID}:dt_scrollState`]: "0,0",
    };
    const response = await this.http.post(SEARCH_PATH, formData);
    return typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  }
}
