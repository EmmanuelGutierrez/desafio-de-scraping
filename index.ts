import { HttpClient } from "./http";
import { OefaScraper } from "./scraper";
import { PdfDownloader } from "./downloader";
import {
  saveRows,
  saveFailedDownloads,
  loadSavedRows,
  loadFailedDownloads,
  printSummary,
  ensureDataDir,
} from "./storage";
import { logger } from "./logger";
import { DownloadResult, ResolucionRow } from "./types";

const args = process.argv.slice(2);
const ONLY_SCRAPE = args.includes("--only-scrape");
const ONLY_DOWNLOAD = args.includes("--only-download");
const RETRY_FAILED = args.includes("--retry-failed");

async function main(): Promise<void> {
  logger.info("═══════════════════════════════════════════");
  logger.info("   OEFA TFA Scraper — inicio de ejecución  ");
  logger.info("═══════════════════════════════════════════");

  ensureDataDir();

  const http = new HttpClient({
    maxRetries: 5,
    baseDelayMs: 1000,
    requestDelayMs: 800,
  });
  const scraper = new OefaScraper(http);
  const downloader = new PdfDownloader(http);
  const results: DownloadResult[] = [];

  await http.initSession();

  let rows: ResolucionRow[];

  // ── Modo: solo reintentar fallidos ───────────────────────────────────────
  if (RETRY_FAILED) {
    logger.info("[main] Modo: reintentar descargas fallidas");
    rows = loadFailedDownloads();
    if (rows.length === 0) {
      logger.info("[main] No hay descargas fallidas guardadas.");
      return;
    }
    for (const row of rows) {
      await http.delay();
      results.push(await downloader.downloadRow(row));
    }

    // ── Modo: solo descarga (usar datos guardados) ───────────────────────────
  } else if (ONLY_DOWNLOAD) {
    logger.info("[main] Modo: solo descarga — cargando datos guardados");
    await scraper.searchOnly()
    const saved = loadSavedRows();
    if (!saved) {
      logger.error(
        "[main] No hay datos guardados. Ejecutá primero sin --only-download.",
      );
      process.exit(1);
    }
    rows = saved;
    for (const row of rows) {
      await http.delay();
      results.push(await downloader.downloadRow(row));
    }

    // ── Modo normal o solo scrape ────────────────────────────────────────────
  } else {
    if (ONLY_SCRAPE) {
      // Solo scraping sin descarga
      await scraper.scrapeAllPages({}, async (pageRows) => {
        saveRows(pageRows);
      });
      logger.success("[main] Extracción completa. Datos guardados.");
      return;
    }

    // Scraping + descarga simultánea
    await scraper.scrapeAllPages({}, async (pageRows) => {
      saveRows(pageRows);
      for (const row of pageRows) {
        await http.delay();
        const result = await downloader.downloadRow(row);
        results.push(result);
      }
    });
  }

  // ── Guardar fallos y resumen ─────────────────────────────────────────────
  const failedRows = downloader.getFailedRows();
  saveFailedDownloads(failedRows);
  printSummary(results);

  if (failedRows.length > 0) {
    logger.warn(
      `[main] Podés reintentar los fallos con: npm start -- --retry-failed`,
    );
  }

  logger.success("[main] ¡Ejecución finalizada!");
}

main().catch((err) => {
  logger.error(`[main] Error fatal: ${err.message}`);
  process.exit(1);
});
