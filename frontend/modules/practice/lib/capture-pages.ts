/** Rasterise an on-screen node into A4 preview pages (same print path as quotes). */

import type { PreviewPage } from "@/modules/practice/pages/pdf-preview-modal";

const A4_RATIO = 297 / 210;
const SCALE = 2;

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const PAPER_TOKENS: Record<string, string> = {
  "--background": "0 0% 100%",
  "--card": "0 0% 100%",
  "--popover": "0 0% 100%",
  "--foreground": "222 47% 12%",
  "--card-foreground": "222 47% 12%",
  "--popover-foreground": "222 47% 12%",
  "--muted": "210 16% 94%",
  "--muted-foreground": "215 14% 38%",
  "--secondary": "210 16% 94%",
  "--secondary-foreground": "222 47% 12%",
  "--accent": "210 16% 94%",
  "--accent-foreground": "222 47% 12%",
  "--border": "214 16% 82%",
  "--input": "214 16% 82%",
  "--canvas-wash-a": "0",
  "--canvas-wash-b": "0",
  "--canvas-wash-c": "0",
};

function copyCssVariables(from: HTMLElement, to: HTMLElement) {
  const computed = getComputedStyle(from);
  for (let i = 0; i < computed.length; i++) {
    const prop = computed.item(i);
    if (prop && prop.startsWith("--")) {
      to.style.setProperty(prop, computed.getPropertyValue(prop));
    }
  }
}

function applyPaperSurface(el: HTMLElement) {
  copyCssVariables(document.documentElement, el);
  for (const [prop, value] of Object.entries(PAPER_TOKENS)) {
    el.style.setProperty(prop, value);
  }
  el.style.backgroundColor = "#ffffff";
  el.style.color = "hsl(var(--foreground))";
  el.style.colorScheme = "light";
}

function copyComputedStyle(from: HTMLElement, to: HTMLElement) {
  const computed = getComputedStyle(from);
  for (let i = 0; i < computed.length; i++) {
    const prop = computed.item(i);
    if (!prop) continue;
    to.style.setProperty(prop, computed.getPropertyValue(prop), computed.getPropertyPriority(prop));
  }
  to.removeAttribute("class");
}

function copyTree(from: Element, to: Element) {
  if (from instanceof HTMLElement && to instanceof HTMLElement) {
    copyComputedStyle(from, to);
  }
  const fromKids = Array.from(from.children);
  const toKids = Array.from(to.children);
  for (let i = 0; i < fromKids.length; i++) {
    if (toKids[i]) copyTree(fromKids[i], toKids[i]);
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || img.src;
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        img.src = await blobToDataUrl(blob);
        img.removeAttribute("srcset");
      } catch {
        /* leave as-is; SVG capture may still work for same-origin blob URLs */
      }
    })
  );
}

function closeVoidTags(xml: string): string {
  return xml.replace(
    /<(img|br|hr|input|col|meta|link|area|base|embed|source|track|wbr)(\s[^>]*?)?>(?!<\/)/gi,
    (full, tag: string, attrs: string | undefined) => {
      if (/\/>\s*$/.test(full)) return full;
      return `<${tag}${attrs || ""} />`;
    }
  );
}

async function elementToCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts.ready.catch(() => undefined);
  const width = Math.max(1, Math.ceil(el.scrollWidth || el.offsetWidth));
  const height = Math.max(1, Math.ceil(el.scrollHeight || el.offsetHeight));

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-14000px",
    "top:0",
    `width:${width}px`,
    "background:#ffffff",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  applyPaperSurface(host);

  const live = el.cloneNode(true) as HTMLElement;
  live.style.width = `${width}px`;
  live.style.maxWidth = "none";
  live.style.backgroundColor = "#ffffff";
  host.appendChild(live);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const captureHeight = Math.max(height, Math.ceil(live.scrollHeight || live.offsetHeight));
    const clone = live.cloneNode(true) as HTMLElement;
    copyCssVariables(host, clone);
    copyTree(live, clone);
    clone.style.width = `${width}px`;
    clone.style.height = `${captureHeight}px`;
    clone.style.maxWidth = "none";
    clone.style.maxHeight = "none";
    clone.style.position = "static";
    clone.style.transform = "none";
    clone.style.overflow = "visible";
    clone.style.backgroundColor = "#ffffff";
    clone.style.color = getComputedStyle(live).color;
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    await inlineImages(clone);

    const serialized = closeVoidTags(new XMLSerializer().serializeToString(clone));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${captureHeight}">` +
      `<rect width="100%" height="100%" fill="#ffffff" />` +
      `<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not capture this report for print preview."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * SCALE));
    canvas.height = Math.max(1, Math.round(captureHeight * SCALE));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not capture this report for print preview.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    host.remove();
  }
}

function canvasSlice(source: HTMLCanvasElement, y: number, sliceHeight: number): HTMLCanvasElement {
  const slice = document.createElement("canvas");
  slice.width = source.width;
  slice.height = sliceHeight;
  const ctx = slice.getContext("2d");
  if (!ctx) throw new Error("Could not paginate this report.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, slice.width, slice.height);
  ctx.drawImage(source, 0, y, source.width, sliceHeight, 0, 0, source.width, sliceHeight);
  return slice;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not capture this report for print preview."));
          return;
        }
        void blobToDataUrl(blob).then(resolve, reject);
      },
      "image/png",
      1
    );
  });
}

export async function captureElementToPages(el: HTMLElement): Promise<PreviewPage[]> {
  const canvas = await elementToCanvas(el);
  const pageHeight = Math.max(1, Math.round(canvas.width * A4_RATIO));
  const pages: PreviewPage[] = [];
  let y = 0;
  let index = 0;
  while (y < canvas.height) {
    const remaining = canvas.height - y;
    const slice = canvasSlice(canvas, y, pageHeight);
    if (remaining < pageHeight * 0.04 && index > 0) break;
    pages.push({ index, data_url: await canvasToDataUrl(slice) });
    index += 1;
    y += pageHeight;
  }
  return pages;
}

async function dataUrlToJpeg(dataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not build the PDF."));
  });
  image.src = dataUrl;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not build the PDF.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not build the PDF."))),
      "image/jpeg",
      0.92
    );
  });
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export async function pagesToPdf(pages: PreviewPage[], title = "Document"): Promise<Blob> {
  const jpegs = [];
  for (const page of pages) jpegs.push(await dataUrlToJpeg(page.data_url));
  if (jpegs.length === 0) throw new Error("Nothing to save as PDF.");

  const pageW = 595.28;
  const pageH = 841.89;
  const objects: Uint8Array[] = [];
  const offsets: number[] = [];

  const addObj = (body: Uint8Array) => {
    objects.push(body);
  };

  addObj(ascii("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));

  const pageIds: number[] = [];
  for (let i = 0; i < jpegs.length; i++) {
    pageIds.push(3 + i * 3);
  }
  addObj(
    ascii(
      `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>\nendobj\n`
    )
  );

  jpegs.forEach((img, i) => {
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const scale = Math.min(pageW / img.width, pageH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;
    const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    addObj(
      ascii(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
      )
    );
    addObj(
      ascii(
        `${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
      )
    );
    addObj(
      concatBytes([
        ascii(
          `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`
        ),
        img.bytes,
        ascii("\nendstream\nendobj\n"),
      ])
    );
  });

  const infoId = 3 + jpegs.length * 3;
  addObj(
    ascii(
      `${infoId} 0 obj\n<< /Title (${pdfEscape(title)}) /Producer (LedgerFlow) >>\nendobj\n`
    )
  );

  const header = ascii("%PDF-1.4\n");
  let cursor = header.length;
  for (const obj of objects) {
    offsets.push(cursor);
    cursor += obj.length;
  }
  const xrefStart = cursor;
  const lines = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
  for (const off of offsets) {
    lines.push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  const xref = ascii(lines.join(""));
  const trailer = ascii(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );
  return new Blob([concatBytes([header, ...objects, xref, trailer])], { type: "application/pdf" });
}
