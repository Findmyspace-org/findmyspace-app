import mammoth from "mammoth";

const PDF_LIBRARY = "pdf-parse@1.1.1";
const DOCX_LIBRARY = "mammoth";

type PdfParseFn = (buffer: Buffer) => Promise<{ text?: string }>;

async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = await import("pdf-parse");
  const fn = (mod as { default?: PdfParseFn }).default ?? (mod as unknown as PdfParseFn);
  if (typeof fn !== "function") {
    throw new Error("PDF parser failed to load.");
  }
  return fn;
}

function logExtractionStart(fileName: string, mimeType: string, library: string) {
  console.info("[ai-document-extract] starting", {
    fileName,
    mimeType,
    library,
  });
}

function logExtractionFailure(
  fileName: string,
  mimeType: string,
  library: string,
  err: unknown
) {
  console.error("[ai-document-extract] failed", {
    fileName,
    mimeType,
    library,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}

function toPdfExtractionError(err: unknown): Error {
  const internal = err instanceof Error ? err.message : String(err);
  if (/password|encrypted/i.test(internal)) {
    return new Error("Unable to extract text from PDF. The file may be password-protected.");
  }
  return new Error("Unable to extract text from PDF");
}

async function extractPdfText(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  logExtractionStart(fileName, mimeType, PDF_LIBRARY);
  try {
    const pdfParse = await loadPdfParse();
    const result = await pdfParse(buffer);
    return (result.text || "").trim();
  } catch (err) {
    logExtractionFailure(fileName, mimeType, PDF_LIBRARY, err);
    throw toPdfExtractionError(err);
  }
}

async function extractDocxText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  logExtractionStart(fileName, mimeType, DOCX_LIBRARY);
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  } catch (err) {
    logExtractionFailure(fileName, mimeType, DOCX_LIBRARY, err);
    throw new Error("Unable to extract text from DOCX");
  }
}

export async function extractTextFromAiDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer, fileName, mimeType || "application/pdf");
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return extractDocxText(
      buffer,
      fileName,
      mimeType ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  throw new Error("Unsupported file type. Upload PDF or DOCX only.");
}
