import "server-only";

import type { PdfTextItem } from "./pdf-sheet-reader";

/**
 * Positioned text of every page of a PDF, read with pdfjs on the server. The route sheet PDFs are
 * generated (not scanned), so no OCR is involved. pdfjs-dist is kept out of the server bundle
 * (next.config.ts) so its worker file loads from node_modules.
 */
export async function extractPdfTextItems(file: ArrayBuffer): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(file),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  try {
    const items: PdfTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        items.push({
          page: pageNumber,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          str: item.str,
        });
      }
      page.cleanup();
    }
    return items;
  } finally {
    await document.destroy();
  }
}
