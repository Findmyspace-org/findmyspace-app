declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    text: string;
    version: string;
  };

  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export = pdfParse;
}
