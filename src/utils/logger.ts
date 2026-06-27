/**
 * logger.ts
 * Sistema de logging con timestamps y niveles.
 * Escribe a consola y a archivo de log simultáneamente.
 */

import * as fs from "fs";
import * as path from "path";

type LogLevel = "info" | "warn" | "error" | "success" | "debug";

const LOG_FILE = path.join(process.cwd(), "scraper.log");
const LOG_STREAM = fs.createWriteStream(LOG_FILE, { flags: "a" });

const COLORS: Record<LogLevel, string> = {
  info:    "\x1b[36m",  // cyan
  warn:    "\x1b[33m",  // yellow
  error:   "\x1b[31m",  // red
  success: "\x1b[32m",  // green
  debug:   "\x1b[90m",  // gray
};
const RESET = "\x1b[0m";

const ICONS: Record<LogLevel, string> = {
  info:    "ℹ",
  warn:    "⚠",
  error:   "✗",
  success: "✓",
  debug:   "·",
};

function formatTimestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function log(level: LogLevel, message: string): void {
  const ts = formatTimestamp();
  const icon = ICONS[level];
  const color = COLORS[level];

  // Consola con colores
  console.log(`${color}[${ts}] ${icon} ${message}${RESET}`);

  // Archivo sin colores
  LOG_STREAM.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`);
}

export const logger = {
  info:    (msg: string) => log("info", msg),
  warn:    (msg: string) => log("warn", msg),
  error:   (msg: string) => log("error", msg),
  success: (msg: string) => log("success", msg),
  debug:   (msg: string) => log("debug", msg),

  progress(current: number, total: number, label: string): void {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
    log("info", `[${bar}] ${pct}% — ${label} (${current}/${total})`);
  },
};
