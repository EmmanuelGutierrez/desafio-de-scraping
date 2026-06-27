/**
 * parser.ts
 * Parsea el HTML del portal OEFA para extraer filas de la tabla y datos de paginación.
 */

import { load, CheerioAPI } from "cheerio";
import { ResolucionRow } from "../types/types";
import { logger } from "./logger";

/**
 * Extrae las filas de la tabla de resultados de una página HTML.
 * Infiere los nombres de columna dinámicamente desde el thead.
 */
export function parseTableRows(html: string): ResolucionRow[] {
  // Extraer CDATA si es respuesta JSF parcial
  if (html.includes("<partial-response")) {
    const dtMatch = html.match(
      /<update id="listarDetalleInfraccionRAAForm:dt"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/,
    );
    if (dtMatch) html = dtMatch[1];
  }

  let htmlToParse = html;
  if (!html.includes("<table")) {
    htmlToParse = `<table><tbody>${html}</tbody></table>`;
  }
  const $ = load(htmlToParse);
  const rows: ResolucionRow[] = [];

  // Buscar directamente los <tr> ya que el CDATA no incluye <table>
  $("tr[data-ri]").each((_, tr) => {
    const rowIndex = parseInt($(tr).attr("data-ri") || "0");
    const cells: string[] = [];

    $(tr)
      .find("td")
      .each((_, td) => {
        cells.push($(td).text().trim());
      });

    if (cells.length === 0) return;

    // Extraer UUID y jsfElementId del onclick
    let uuid: string | null = null;
    let jsfElementId: string | null = null;

    const pdfLink = $(tr).find("a[onclick*='param_uuid']");
    if (pdfLink.length) {
      const onclick = pdfLink.attr("onclick") || "";
      const uuidMatch = onclick.match(/param_uuid['":\s]+([a-f0-9-]{36})/i);
      if (uuidMatch) uuid = uuidMatch[1];
      const jsfIdMatch = onclick.match(/'([^']*j_idt[^']*)'\s*:/);
      if (jsfIdMatch) jsfElementId = jsfIdMatch[1];
    }

    const row: ResolucionRow = {
      rowIndex,
      expediente: cells[1] || "", // columna 0 es el nro de fila
      administrado: cells[2] || "",
      unidadFiscalizable: cells[3] || "",
      sector: cells[4] || "",
      nroResolucionApelacion: cells[5] || "",
      uuid,
      jsfElementId,
      fileName: "",
    };

    row.fileName = buildFileName(row);

    rows.push(row);
  });
  return rows;
}

/**
 * Extrae información de paginación del HTML.
 * Retorna { currentPage, totalPages, totalRecords }.
 */
export function parsePagination(html: string): {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
} {
  if (html.includes("<partial-response")) {
    const cdataMatch = html.match(
      /<update id="listarDetalleInfraccionRAAForm:dt"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/,
    );
    if (cdataMatch) {
      html = cdataMatch[1];
      logger.debug("[parser] HTML parseado desde CDATA");
    }
  }
  const $ = load(html);

  // PrimeFaces/JSF suele mostrar "Página X de Y" o similar
  let currentPage = 1;
  let totalPages = 1;
  let totalRecords = 0;

  // Buscar texto de paginación en varios formatos comunes
  const paginatorText = $(
    "[id*='paginator'], .ui-paginator, [class*='paginator']",
  ).text();

  const pageMatch = paginatorText.match(/(\d+)\s*(?:de|\/|of)\s*(\d+)/i);
  if (pageMatch) {
    currentPage = parseInt(pageMatch[1]);
    totalPages = parseInt(pageMatch[2]);
  }

  // Buscar total de registros
  const totalMatch =
    paginatorText.match(/(\d+)\s*(?:registros?|records?|resultados?)/i) ||
    $("body")
      .text()
      .match(/Total[:\s]+(\d+)/i);
  if (totalMatch) totalRecords = parseInt(totalMatch[1]);

  // Contar filas como fallback para detectar si hay datos
  if (totalRecords === 0) {
    totalRecords = $("tbody tr").length;
  }

  // Detectar botón "siguiente" deshabilitado como señal de última página
  const nextDisabled =
    $(
      ".ui-paginator-next.ui-state-disabled, [id*='next'][disabled], button[aria-label*='Next'][disabled]",
    ).length > 0;

  if (nextDisabled && totalPages === 1) {
    totalPages = currentPage;
  }

  return { currentPage, totalPages, totalRecords };
}

/**
 * Extrae el ViewState del HTML (necesario para requests JSF subsiguientes).
 */
export function extractViewState($: CheerioAPI): string {
  return ($('input[name="javax.faces.ViewState"]').val() as string) || "";
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Busca una celda por coincidencia parcial con los encabezados conocidos.
 */
function getCellByHeader(
  cells: string[],
  headers: string[],
  keywords: string[],
): string | null {
  const idx = headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  return idx >= 0 && idx < cells.length ? cells[idx] : null;
}

/**
 * Construye un nombre de archivo descriptivo y seguro para el PDF.
 */
function buildFileName(row: ResolucionRow): string {
  const parts = [row.expediente, row.administrado, row.nroResolucionApelacion]
    .map((s) =>
      s
        .replace(/[/\\?%*:|"<>]/g, "-") // caracteres inválidos en Windows
        .replace(/\s+/g, " ") // espacios múltiples
        .trim(),
    )
    .filter(Boolean);

  const name = parts.join("_").substring(0, 100) || `documento_${row.rowIndex}`;

  return `${name}.pdf`;
}
