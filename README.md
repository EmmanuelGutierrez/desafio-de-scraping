# OEFA TFA Scraper

Scraper en TypeScript para el portal de resoluciones del Tribunal de Fiscalización Ambiental (TFA) del OEFA.

**Portal:** https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml

---

## Características

- ✅ Navegación por todas las páginas de resultados
- ✅ Extracción de todos los campos de la tabla
- ✅ Descarga de PDFs con nombre descriptivo
- ✅ Manejo de errores 429 con backoff exponencial
- ✅ Reintentos automáticos y registro de fallos
- ✅ Exportación de datos en JSON y CSV
- ✅ Sin automatización de navegador (solo axios + cheerio)
- ✅ Logging detallado con timestamps

---

## Requisitos

- Node.js >= 18
- npm >= 8

---

## Instalación

```bash
git clone <url-del-repo>
cd oefa-scraper
npm install
```

---

## Uso

### Extracción completa + descarga de PDFs
```bash
npm start
```

### Solo extraer datos (sin descargar PDFs)
```bash
npm start -- --only-scrape
```

### Solo descargar PDFs (con datos ya extraídos)
```bash
npm start -- --only-download
```

### Reintentar descargas fallidas
```bash
npm start -- --retry-failed
```

---

## Estructura del proyecto

```
oefa-scraper/
├── src/
│   ├── index.ts        # Punto de entrada y orquestador
│   ├── types/
│   │   └── types.ts    # Tipos e interfaces
│   └── utils/
│       ├── http.ts         # Cliente HTTP con sesión JSF y reintentos
│       ├── scraper.ts      # Lógica de búsqueda y paginación
│       ├── parser.ts       # Parsing de HTML (tabla + paginación)
│       ├── downloader.ts   # Descarga de PDFs
│       ├── storage.ts      # Guardado en JSON/CSV
│       ├── logger.ts       # Sistema de logging
│       └── isPdf.ts        # Validación de firmas PDF (magic numbers)
├── pdfs/               # PDFs descargados (generado automáticamente)
├── data/               # Datos extraídos JSON/CSV (generado automáticamente)
│   ├── resoluciones.json
│   ├── resoluciones.csv
│   └── failed_downloads.json
├── scraper.log         # Log de ejecución
├── package.json
├── tsconfig.json
└── README.md
```

---

## Datos extraídos

Por cada registro se extrae:

| Campo | Descripción |
|---|---|
| `expediente` | Número de expediente |
| `administrado` | Empresa o persona administrada |
| `unidadFiscalizable` | Unidad fiscalizable |
| `sector` | Sector (Minería, Energía, etc.) |
| `nroResolucionApelacion` | Número de resolución de apelación |
| `uuid` | UUID interno del documento |
| `fileName` | Nombre del archivo PDF descargado |

---

## Manejo de errores

### Error 429 (Too Many Requests)
El scraper implementa **backoff exponencial**:
- Intento 1: espera 1s
- Intento 2: espera 2s
- Intento 3: espera 4s
- Intento 4: espera 8s
- Intento 5: espera 16s

Si el servidor incluye el header `Retry-After`, se respeta ese valor.

### Documentos fallidos
Los documentos que no pudieron descargarse se guardan en `data/failed_downloads.json`. Para reintentarlos:
```bash
npm start -- --retry-failed
```

---

## Recomendaciones

- Ejecutar primero `--only-scrape` para verificar que la extracción funciona correctamente antes de iniciar las descargas.
- El scraper incluye un delay de ~800ms entre requests para no sobrecargar el servidor.
- Para grandes volúmenes, se puede dejar corriendo — retoma automáticamente los PDFs ya descargados (no re-descarga).

---

## Notas técnicas

El portal usa **JavaServer Faces (JSF)** con PrimeFaces, lo que requiere:
1. Mantener cookies de sesión entre requests
2. Enviar el `javax.faces.ViewState` en cada POST
3. Simular los eventos de paginación y descarga de JSF

La descarga de PDFs se realiza mediante dos estrategias:
1. **URL directa por UUID** — construida a partir del `param_uuid` del botón
2. **Trigger JSF** — replicando el `onclick` de mojarra que ejecuta el servidor
