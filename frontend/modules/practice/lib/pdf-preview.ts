/** Same print-preview popup used for quotes, invoices, and supplier statements. */

export function openPdfPreview(blob: Blob, title: string): void {
  const pdf = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdf);
  const width = Math.max(960, Math.round(window.screen.availWidth * 0.9));
  const height = Math.max(720, Math.round(window.screen.availHeight * 0.92));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const popup = window.open(
    "",
    `ledgerflow-print-${Date.now()}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error("Allow pop-ups for LedgerFlow so print preview can open as its own window.");
  }
  const titleText = title.replace(/</g, "");
  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${titleText}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #1c1c1c; color: #f4f4f4; font-family: Segoe UI, sans-serif; }
    body { display: flex; flex-direction: column; min-height: 100%; }
    header {
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 14px; background: #111; border-bottom: 1px solid #333;
    }
    header strong { font-size: 14px; }
    header span { font-size: 12px; color: #bbb; margin-left: 8px; }
    .actions { display: flex; gap: 8px; }
    button, a.btn {
      border: 1px solid #555; background: #2a2a2a; color: #fff;
      padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
      text-decoration: none; display: inline-block;
    }
    button.primary { background: #2f6f3e; border-color: #3d8a50; }
    button:hover, a.btn:hover { filter: brightness(1.12); }
    #stage { flex: 1 1 auto; position: relative; min-height: 0; width: 100%; background: #525659; }
    #viewer {
      position: absolute; inset: 0; width: 100%; height: 100%;
      border: 0; background: #525659;
    }
  </style>
</head>
<body>
  <header>
    <div><strong>${titleText}</strong><span>Resize this window from the edges · zoom inside the PDF</span></div>
    <div class="actions">
      <button class="primary" id="print-btn">Print</button>
      <a class="btn" id="open-btn" target="_blank" rel="noreferrer">Open PDF</a>
      <button id="close-btn">Close</button>
    </div>
  </header>
  <div id="stage">
    <embed id="viewer" type="application/pdf" />
  </div>
  <script>
    (function () {
      var src = ${JSON.stringify(url)};
      var viewer = document.getElementById("viewer");
      var openBtn = document.getElementById("open-btn");
      openBtn.href = src;
      viewer.setAttribute("src", src);
      document.getElementById("print-btn").onclick = function () {
        try {
          if (viewer && viewer.contentWindow) {
            viewer.contentWindow.focus();
            viewer.contentWindow.print();
            return;
          }
        } catch (e) {}
        window.open(src, "_blank");
      };
      document.getElementById("close-btn").onclick = function () { window.close(); };
    })();
  </script>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  const timer = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(timer);
      URL.revokeObjectURL(url);
    }
  }, 400);
}
