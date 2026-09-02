"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopApp } from "@/lib/desktop";
import { practiceApi } from "@/modules/practice/lib/api";

export type PreviewPage = {
  index: number;
  data_url: string;
};

type Props = {
  open: boolean;
  title: string;
  pages: PreviewPage[];
  documentId?: number | null;
  onClose: () => void;
};

function pdfFilename(title: string): string {
  const stem = title.replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim() || "document";
  return `${stem}.pdf`;
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function saveBlobAsPdf(blob: Blob, filename: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isPdfBytes(bytes)) {
    throw new Error("The download was not a valid PDF. Try again.");
  }
  const pdf = new Blob([bytes], { type: "application/pdf" });
  const safeName = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;

  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: BufferSource | { type: "write"; data: BufferSource }) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: safeName,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      // Raw bytes only. Passing a Blob can stringify to "[object Blob]" and corrupt the file.
      await writable.write({ type: "write", data: bytes });
      await writable.close();
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(pdf);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  ).then(() => undefined);
}

export function PdfPreviewModal({ open, title, pages, documentId, onClose }: Props) {
  const [busy, setBusy] = useState<"save" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setError(null);
    return () => {
      printFrameRef.current?.remove();
      printFrameRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  async function savePdf() {
    if (!documentId) {
      setError("Save this document first, then save the PDF.");
      return;
    }
    setBusy("save");
    try {
      setError(null);
      const blob = await practiceApi.documents.pdfBlob(documentId);
      await saveBlobAsPdf(blob, pdfFilename(title));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save PDF");
    } finally {
      setBusy(null);
    }
  }

  function attachPrintFrame(iframe: HTMLIFrameElement) {
    printFrameRef.current?.remove();
    printFrameRef.current = iframe;
    document.body.appendChild(iframe);
  }

  function printPdfBlob(blob: Blob): Promise<boolean> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.title = "Print PDF";
      iframe.style.cssText =
        "position:fixed;left:-12000px;top:0;width:210mm;height:297mm;border:0;";
      let opened = false;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.setTimeout(() => {
          iframe.remove();
          if (printFrameRef.current === iframe) printFrameRef.current = null;
          URL.revokeObjectURL(url);
        }, 600);
        resolve(ok);
      };
      iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) {
          finish(false);
          return;
        }
        window.setTimeout(() => {
          try {
            win.addEventListener("afterprint", () => finish(true));
            opened = true;
            win.focus();
            win.print();
          } catch {
            finish(false);
          }
        }, 350);
      };
      iframe.onerror = () => finish(false);
      window.setTimeout(() => {
        if (!opened) finish(false);
      }, 8000);
      attachPrintFrame(iframe);
      iframe.src = url;
    });
  }

  async function printPngPages() {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Print";
    iframe.style.cssText =
      "position:fixed;left:-12000px;top:0;width:210mm;height:297mm;border:0;";
    attachPrintFrame(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      throw new Error("Could not open the print dialog.");
    }
    const titleSafe = title.replace(/</g, "");
    const imgs = pages.map((p) => `<img src="${p.data_url}" alt="" />`).join("");
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${titleSafe}</title>
      <style>
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        img {
          display: block; width: 210mm; max-width: 100%; height: auto;
          page-break-after: always; page-break-inside: avoid;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        img:last-child { page-break-after: auto; }
      </style></head><body>${imgs}</body></html>`);
    doc.close();
    await waitForImages(doc);
    await new Promise((r) => window.setTimeout(r, 80));
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("afterprint", onAfter);
        resolve(ok);
      };
      const onAfter = () => done(true);
      win.addEventListener("afterprint", onAfter, { once: true });
      window.addEventListener("afterprint", onAfter, { once: true });
      win.focus();
      win.print();
    });
  }

  async function printPages() {
    setBusy("print");
    let printed = false;
    try {
      setError(null);
      if (documentId && !isDesktopApp()) {
        const blob = await practiceApi.documents.pdfBlob(documentId);
        printed = await printPdfBlob(blob);
      }
      if (!printed) {
        printed = await printPngPages();
      }
    } catch (e: unknown) {
      printFrameRef.current?.remove();
      printFrameRef.current = null;
      setError(e instanceof Error ? e.message : "Could not print");
    } finally {
      setBusy(null);
    }
    if (printed) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onMouseDown={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-[hsl(var(--neon-lime)/0.45)] bg-[#525659] shadow-lg"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/30 bg-card px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {pages.length} {pages.length === 1 ? "page" : "pages"} · Print uses the original PDF when
              possible
            </p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void savePdf()}
              disabled={busy !== null || !documentId}
            >
              <FileDown className="mr-1 h-3.5 w-3.5" />
              {busy === "save" ? "Saving…" : "Save PDF"}
            </Button>
            <Button type="button" size="sm" onClick={() => void printPages()} disabled={busy !== null || pages.length === 0}>
              <Printer className="mr-1 h-3.5 w-3.5" />
              {busy === "print" ? "Printing…" : "Print"}
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4">
            {pages.map((page) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.index}
                src={page.data_url}
                alt={`${title} page ${page.index + 1}`}
                className="w-full bg-white shadow-md"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
