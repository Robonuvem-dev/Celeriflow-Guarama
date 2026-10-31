import { mkdir } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { z } from "zod";

const zoneSchema = z.object({ page: z.number().int().min(1).max(200), label: z.string().trim().min(1).max(100), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0) }).refine(zone => zone.x + zone.width <= 1 && zone.y + zone.height <= 1);
const inputSchema = z.object({ contentBase64: z.string().min(1).max(28_000_000), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]), language: z.literal("por"), pages: z.array(z.number().int().min(1).max(200)).max(200), zones: z.array(zoneSchema).length(1).optional(), coordinateSystem: z.literal("normalized-top-left").optional() });
const maxPixels = 16_000_000;

export function createGedOcrEngine({ cachePath, timeoutMs = 55_000 } = {}) {
  let worker;
  async function initialize() {
    if (worker) return;
    if (cachePath) await mkdir(cachePath, { recursive: true });
    worker = await createWorker("por", 1, { ...(cachePath ? { cachePath } : {}), logger: () => {} });
    await worker.setParameters({ preserve_interword_spaces: "1" });
  }
  async function terminate() { const current = worker; worker = undefined; if (current) await current.terminate(); }
  async function recognize(raw) {
    const input = inputSchema.parse(raw);
    if (new Set(input.pages).size !== input.pages.length) throw new Error("Páginas duplicadas.");
    const zone = input.zones?.[0];
    if (zone && (input.coordinateSystem !== "normalized-top-left" || input.pages.length !== 1 || input.pages[0] !== zone.page)) throw new Error("Página e coordenadas da zona inválidas.");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) throw new Error("Conteúdo base64 inválido.");
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Original vazio ou superior a 20 MiB.");
    const isPdf = input.mimeType === "application/pdf";
    if (isPdf ? bytes.subarray(0, 5).toString() !== "%PDF-" : input.mimeType === "image/png" ? !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error("Formato físico inválido.");
    await initialize();
    let timer, task;
    const work = async () => {
      let pdf;
      if (isPdf) {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, stopAtErrors: true });
        pdf = await task.promise;
      }
      const count = pdf?.numPages ?? 1;
      if (count > 200) throw new Error("Divida originais com mais de 200 páginas.");
      const selected = input.pages.length ? input.pages : Array.from({ length: count }, (_, index) => index + 1);
      if (selected.some(page => page > count)) throw new Error("Página inexistente.");
      const pages = [];
      let textLength = 0;
      for (const number of selected) {
        let image;
        if (pdf) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 2, rotation: (page.rotate + (zone?.rotation ?? 0)) % 360 });
          const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
          if (width * height > maxPixels) throw new Error("Página superior a 16 megapixels.");
          const canvas = createCanvas(width, height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
          image = canvas.toBuffer("image/png");
          page.cleanup();
        } else image = await sharp(bytes, { limitInputPixels: maxPixels }).rotate(zone?.rotation ?? 0).png().toBuffer();
        if (zone) {
          const { width, height } = await sharp(image).metadata();
          const left = Math.floor(zone.x * width), top = Math.floor(zone.y * height);
          const cropWidth = Math.min(width - left, Math.ceil(zone.width * width));
          const cropHeight = Math.min(height - top, Math.ceil(zone.height * height));
          if (cropWidth < 2 || cropHeight < 2) throw new Error("Zona muito pequena.");
          image = await sharp(image).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
        }
        const { data } = await worker.recognize(image);
        if (data.text.length > 100_000 || (textLength += data.text.length) > 2_000_000) throw new Error("Texto superior ao limite documental.");
        pages.push({ page: number, text: data.text, confidence: Math.max(0, Math.min(1, data.confidence / 100)), ...(zone ? { label: zone.label } : {}) });
      }
      return { pages };
    };
    try {
      return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { void terminate().catch(() => {}); reject(new Error("Prazo de reconhecimento excedido.")); }, timeoutMs); })]);
    } finally { clearTimeout(timer); if (task) await task.destroy(); }
  }
  return { initialize, recognize, terminate };
}
