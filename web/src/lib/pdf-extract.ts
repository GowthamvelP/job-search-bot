/**
 * PDF text extraction using pdf.js + Tesseract.js OCR fallback.
 *
 * Strategy:
 * 1. Try pdf.js text layer extraction first (fast, works for native-text PDFs)
 * 2. If text layer is too short (<50 chars), fall back to OCR via Tesseract.js
 *    (handles scanned PDFs, image-based PDFs, and LaTeX-generated PDFs)
 *
 * Tesseract.js is the industry-standard browser OCR — port of Google's Tesseract engine.
 */

const MIN_TEXT_THRESHOLD = 50; // chars — below this, assume text layer is empty/garbage

export interface ExtractionProgress {
  stage: "parsing" | "ocr";
  page?: number;
  totalPages?: number;
  ocrProgress?: number; // 0-1
}

export async function extractTextFromPDF(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  // --- Stage 1: Try pdf.js text layer ---
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  onProgress?.({ stage: "parsing", page: 0, totalPages });

  // Extract text layer
  const textPages: string[] = [];
  for (let i = 1; i <= totalPages; i++) {
    onProgress?.({ stage: "parsing", page: i, totalPages });
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");
    textPages.push(text);
  }

  const textLayerResult = textPages.join("\n\n").trim();

  // If text layer has sufficient content, use it (it's faster and more accurate for native PDFs)
  if (textLayerResult.length >= MIN_TEXT_THRESHOLD) {
    return textLayerResult;
  }

  // --- Stage 2: OCR fallback using Tesseract.js ---
  onProgress?.({ stage: "ocr", page: 0, totalPages });

  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", undefined, {
    logger: (m: any) => {
      if (m.status === "recognizing text" && m.progress) {
        onProgress?.({ stage: "ocr", ocrProgress: m.progress });
      }
    },
  });

  const ocrPages: string[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.({ stage: "ocr", page: i, totalPages });

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR accuracy

    // Render page to canvas
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport } as any).promise;

    // Run OCR on the rendered image
    const { data } = await worker.recognize(canvas);
    ocrPages.push(data.text);

    // Clean up canvas
    canvas.width = 0;
    canvas.height = 0;
  }

  await worker.terminate();

  return ocrPages.join("\n\n").trim();
}
