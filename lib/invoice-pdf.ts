import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const PRODUCTION_PDF_ERROR =
  "We could not generate your invoice PDF. Please try again.";
const LOCAL_CHROME_ERROR =
  "Could not generate PDF. For local development, install Chrome/Chromium or set CHROME_EXECUTABLE_PATH.";

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function localChromePath(): string | undefined {
  return (
    process.env.CHROME_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "linux"
        ? "/usr/bin/google-chrome"
        : undefined)
  );
}

/** Locate the brotli pack so Next.js file tracing / cwd layouts still work. */
export function resolveChromiumBinDirectory(): string | undefined {
  const candidates: string[] = [];
  try {
    const require = createRequire(__filename);
    candidates.push(
      join(dirname(require.resolve("@sparticuz/chromium/package.json")), "bin")
    );
  } catch {
    // Package resolution can fail only if the dependency is missing.
  }
  candidates.push(join(process.cwd(), "node_modules/@sparticuz/chromium/bin"));

  return candidates.find((dir) => existsSync(join(dir, "chromium.br")));
}

export function invoicePdfUserMessage(error: unknown): string {
  if (isVercelRuntime()) return PRODUCTION_PDF_ERROR;
  const message = error instanceof Error ? error.message : String(error);
  if (
    /CHROME_EXECUTABLE_PATH|No Chromium executable|does not exist|Failed to launch/i.test(
      message
    )
  ) {
    return LOCAL_CHROME_ERROR;
  }
  return PRODUCTION_PDF_ERROR;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const serverless = isVercelRuntime();
  const localChrome = localChromePath();
  const chromiumBin = serverless ? resolveChromiumBinDirectory() : undefined;

  if (serverless) {
    chromium.setGraphicsMode = false;
    console.info("invoice pdf chromium resolve", {
      node: process.version,
      bin: chromiumBin ?? null,
    });
  }

  const executablePath = serverless
    ? await chromium.executablePath(chromiumBin)
    : localChrome;

  if (!executablePath) {
    throw new Error("No Chromium executable found.");
  }

  const browser = await puppeteer.launch({
    args: serverless ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    defaultViewport: serverless ? chromium.defaultViewport : undefined,
    executablePath,
    headless: serverless ? chromium.headless : true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
