/**
 * Converts a PDF file to a JPEG image (renders first page).
 * Uses pdfjs-dist to render the PDF on a canvas, then exports as JPEG.
 */
import * as pdfjsLib from "pdfjs-dist";

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function pdfToImage(pdfFile: File): Promise<{ imageFile: File; previewUrl: string }> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Get total pages
  const totalPages = pdf.numPages;

  if (totalPages === 1) {
    // Single page: render at high quality
    return renderPage(pdf, 1, 2.0);
  }

  // Multiple pages: render all and stitch vertically
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    // Limit to 5 pages max for performance
    const page = await pdf.getPage(i);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    canvases.push(canvas);
  }

  // Stitch canvases vertically
  const totalWidth = Math.max(...canvases.map((c) => c.width));
  const totalHeight = canvases.reduce((sum, c) => sum + c.height, 0);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = totalWidth;
  finalCanvas.height = totalHeight;
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.fillStyle = "#ffffff";
  finalCtx.fillRect(0, 0, totalWidth, totalHeight);

  let y = 0;
  for (const c of canvases) {
    finalCtx.drawImage(c, 0, y);
    y += c.height;
  }

  return canvasToFile(finalCanvas);
}

async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<{ imageFile: File; previewUrl: string }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvasToFile(canvas);
}

function canvasToFile(canvas: HTMLCanvasElement): Promise<{ imageFile: File; previewUrl: string }> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          resolve({ imageFile: file, previewUrl: url });
        }
      },
      "image/jpeg",
      0.85,
    );
  });
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
