/**
 * http.ts
 * Cliente HTTP con manejo de sesión JSF, cookies y reintentos con backoff exponencial.
 */

import axios, { AxiosInstance, AxiosResponse } from "axios";
import { isPdf } from "./isPdf";

const BASE_URL = "https://publico.oefa.gob.pe";
const SEARCH_PATH = "/repdig/consulta/consultaTfa.xhtml";

/** Parámetros de configuración para el cliente HTTP */
interface HttpClientConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  requestDelayMs?: number;
}

/** Estado de sesión JSF */
interface JsfSession {
  cookies: string;
  viewState: string;
}

export class HttpClient {
  private client: AxiosInstance;
  private session: JsfSession = { cookies: "", viewState: "" };
  private maxRetries: number;
  private baseDelayMs: number;
  private requestDelayMs: number;

  constructor(config: HttpClientConfig = {}) {
    this.maxRetries = config.maxRetries ?? 5;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.requestDelayMs = config.requestDelayMs ?? 800;

    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      maxRedirects: 5,
    });
  }

  /**
   * Inicia sesión con el portal: hace GET inicial para capturar cookies y ViewState.
   */
  async initSession(): Promise<void> {
    console.log("[session] Iniciando sesión con el portal OEFA...");
    const response = await this.client.get(SEARCH_PATH);
    this.extractSession(response);
    console.log("[session] Sesión iniciada correctamente.");
  }

  /**
   * Extrae cookies y ViewState de una respuesta HTTP.
   */
  private extractSession(response: AxiosResponse): void {
    // Capturar cookies del header Set-Cookie
    const setCookie = response.headers["set-cookie"];
    if (setCookie) {
      this.session.cookies = setCookie
        .map((c: string) => c.split(";")[0])
        .join("; ");

      this.client.defaults.headers.common["Cookie"] = this.session.cookies;
    }

    // Extraer ViewState del HTML (necesario para requests JSF)
    const html = typeof response.data === "string" ? response.data : "";
    const viewStateMatch = html.match(
      /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/,
    );
    if (viewStateMatch) {
      this.session.viewState = viewStateMatch[1];
    }
  }

  async postBinary(
    path: string,
    payload: URLSearchParams,
  ): Promise<Buffer | null> {
    const sessionPath = this.getSessionUrl(path);
    const response = await this.withRetry(() =>
      this.client.post(sessionPath, payload, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          Referer: `${BASE_URL}${SEARCH_PATH}`,
          "upgrade-insecure-requests": "1",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "sec-fetch-user": "?1",
        },
        responseType: "arraybuffer",
      }),
    );

    const buffer = Buffer.from(response.data);
    return isPdf(buffer) ? buffer : null;
  }

  /**
   * GET con reintentos y backoff exponencial.
   */
  async get(url: string): Promise<AxiosResponse> {
    return this.withRetry(() => this.client.get(url));
  }

  /**
   * POST con form data, reintentos y backoff exponencial.
   * Actualiza el ViewState si la respuesta lo incluye.
   */
  async post(
    path: string,
    formData: Record<string, string>,
  ): Promise<AxiosResponse> {
    const payload = new URLSearchParams({
      ...formData,
      "javax.faces.ViewState": this.session.viewState,
    });
    const sessionPath = this.getSessionUrl(path);
    const response = await this.withRetry(() =>
      this.client.post(sessionPath, payload, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}${SEARCH_PATH}`,
          Origin: BASE_URL,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/xml, text/xml, */*; q=0.01",
          "Faces-Request": "partial/ajax",
        },
      }),
    );

    // Actualizar ViewState si viene en la respuesta
    this.extractSession(response);
    return response;
  }

  /**
   * Descarga binaria (para PDFs) con reintentos.
   * Retorna null si falla después de todos los reintentos.
   */
  async downloadBinary(url: string): Promise<Buffer | null> {
    try {
      const response = await this.withRetry(() =>
        this.client.get(url, { responseType: "arraybuffer" }),
      );
      return Buffer.from(response.data);
    } catch (err) {
      console.error(`[download] Falló definitivamente: ${url}`);
      return null;
    }
  }

  /**
   * Ejecuta un POST para trigger de descarga JSF (botón onclick de mojarra).
   * Retorna el buffer del PDF si la respuesta es binaria, o null.
   */
  async triggerJsfDownload(
    formId: string,
    params: Record<string, string>,
  ): Promise<Buffer | null> {
    const payload = new URLSearchParams({
      ...params,
      "javax.faces.ViewState": this.session.viewState,
      "javax.faces.behavior.event": "action",
      "javax.faces.partial.event": "click",
      "javax.faces.source": Object.keys(params)[0],
      "javax.faces.partial.ajax": "true",
      "javax.faces.partial.execute": "@all",
      "javax.faces.partial.render": "@all",
      [formId]: formId,
    });

    try {
      const response = await this.withRetry(() =>
        this.client.post(SEARCH_PATH, payload, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: `${BASE_URL}${SEARCH_PATH}`,
            "Faces-Request": "partial/ajax",
          },
          responseType: "arraybuffer",
        }),
      );

      const contentType = response.headers["content-type"] || "";
      if (
        typeof contentType === "string" &&
        (contentType.includes("pdf") || contentType.includes("octet-stream"))
      ) {
        return Buffer.from(response.data);
      }

      // Si no es PDF directo, puede ser una redirección a URL del PDF
      const text = Buffer.from(response.data).toString("utf-8");
      const pdfUrlMatch = text.match(/https?:\/\/[^\s"'<>]+\.pdf[^\s"'<>]*/i);
      if (pdfUrlMatch) {
        return this.downloadBinary(pdfUrlMatch[0]);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delay configurable entre requests para no sobrecargar el servidor.
   */
  async delay(ms?: number): Promise<void> {
    const wait = ms ?? this.requestDelayMs;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  /**
   * get de jsf sin reintentos
   */
  getSessionUrl(path: string): string {
    const jsessionId = this.session.cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("JSESSIONID"))
      ?.split("=")[1];
    return jsessionId ? `${path};jsessionid=${jsessionId}` : path;
  }

  /**
   * Wrapper de reintentos con backoff exponencial.
   * Maneja específicamente el error 429 (Too Many Requests).
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Backoff exponencial: 1s, 2s, 4s, 8s, 16s...
          const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
          console.log(
            `[retry] Intento ${attempt}/${this.maxRetries} — esperando ${delay}ms`,
          );
          await this.delay(delay);
        }
        return await fn();
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          lastError = err;

          if (err.response?.status === 429) {
            // Too Many Requests: respetar Retry-After si viene en el header
            const retryAfter = err.response.headers["retry-after"];
            const waitMs = retryAfter
              ? parseInt(retryAfter) * 1000
              : this.baseDelayMs * Math.pow(2, attempt);

            console.warn(
              `[429] Too Many Requests — esperando ${waitMs}ms antes de reintentar`,
            );
            await this.delay(waitMs);
            continue;
          }

          if (err.response?.status === 403 || err.response?.status === 401) {
            console.warn("[auth] Error de autenticación — reiniciando sesión");
            await this.initSession();
            continue;
          }

          // Para otros errores HTTP, no reintentar
          if (err.response && err.response.status < 500) {
            throw err;
          }
        } else if (err instanceof Error) {
          lastError = err;
        }

        console.warn(
          `[error] Intento ${attempt + 1} fallido: ${lastError.message}`,
        );
      }
    }

    throw lastError;
  }

  getViewState(): string {
    return this.session.viewState;
  }
}

export { SEARCH_PATH, BASE_URL };
