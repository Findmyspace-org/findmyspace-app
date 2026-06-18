import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractTextFromAiDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text || "").trim();
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  throw new Error("Unsupported file type. Upload PDF or DOCX only.");
}
