import {
  formatDateTime,
  formatRupiah,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "./format";
import type { CartItem, Order } from "./types";

export type TicketStation = "kitchen" | "bar";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function receiptItemRows(items: CartItem[]): string {
  return items
    .map((item) => {
      const modifiers =
        item.modifiers.length > 0
          ? `<div class="muted">+ ${escapeHtml(
              item.modifiers.map((modifier) => modifier.name).join(", "),
            )}</div>`
          : "";
      const variant = item.variantName
        ? ` <span class="muted">(${escapeHtml(item.variantName)})</span>`
        : "";
      const itemNote = item.note
        ? `<div class="muted">Catatan: ${escapeHtml(item.note)}</div>`
        : "";
      return `
        <tr>
          <td>${item.qty}x ${escapeHtml(item.name)}${variant}${modifiers}${itemNote}</td>
          <td class="right">${formatRupiah(item.price * item.qty)}</td>
        </tr>`;
    })
    .join("");
}

function ticketItems(items: CartItem[]): string {
  return items
    .map((item) => {
      const variant = item.variantName
        ? ` <span class="muted">(${escapeHtml(item.variantName)})</span>`
        : "";
      const modifiers =
        item.modifiers.length > 0
          ? `<div class="modifier">${item.modifiers
              .map(
                (modifier) =>
                  `+ ${escapeHtml(modifier.groupName)}: ${escapeHtml(modifier.name)}`,
              )
              .join("<br />")}</div>`
          : "";
      const itemNote = item.note
        ? `<div class="note">CATATAN ITEM: ${escapeHtml(item.note)}</div>`
        : "";

      return `
        <div class="item">
          <div class="item-name">${item.qty}x ${escapeHtml(item.name)}${variant}</div>
          ${modifiers}
          ${itemNote}
        </div>`;
    })
    .join("");
}

const PRINT_STYLE = `
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #1b120c;
      margin: 0;
      padding: 12px;
      width: 80mm;
    }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 700; letter-spacing: 0.04em; }
    .muted { color: #6b5a4b; font-size: 10px; }
    .line { border-top: 1px dashed #9a8574; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .total { font-size: 14px; font-weight: 700; }
    .badge {
      display: inline-block;
      border: 1px solid #1b120c;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    @media print {
      body { padding: 0; }
    }`;

const TICKET_STYLE = `
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      color: #1b120c;
      margin: 0;
      padding: 12px;
      width: 80mm;
    }
    .center { text-align: center; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: 0.08em; }
    .muted { color: #6b5a4b; font-size: 11px; }
    .line { border-top: 1px dashed #9a8574; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .item { margin: 8px 0; padding-bottom: 6px; border-bottom: 1px dotted #c9b8a8; }
    .item:last-child { border-bottom: none; }
    .item-name { font-size: 15px; font-weight: 700; }
    .modifier { margin-top: 2px; font-size: 12px; }
    .note {
      margin-top: 4px;
      padding: 4px 6px;
      border: 1px solid #1b120c;
      font-weight: 700;
      font-size: 12px;
    }
    .badge {
      display: inline-block;
      border: 1px solid #1b120c;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    @media print {
      body { padding: 0; }
    }`;

/** HTML struk pelanggan/kasir (tanpa script cetak). */
export function buildReceiptHtml(
  order: Order,
  paperWidth: 58 | 80 = 80,
): string {
  const paymentLine = order.paymentMethod
    ? PAYMENT_METHOD_LABEL[order.paymentMethod]
    : "Belum dibayar";
  const pageWidth = paperWidth === 58 ? "58mm" : "80mm";

  const paidRows =
    order.paymentStatus === "paid"
      ? `<tr><td>Diterima</td><td class="right">${formatRupiah(order.paidAmount)}</td></tr>
         <tr><td>Kembalian</td><td class="right">${formatRupiah(order.change)}</td></tr>`
      : "";

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(order.code)}</title>
  <style>${PRINT_STYLE}
    body { width: ${pageWidth}; }
  </style>
</head>
<body>
  <div class="center">
    <div class="brand">SEMOET CAFE</div>
    <div class="muted">${escapeHtml(order.branchName ?? "Semoet Cafe")}</div>
  </div>
  <div class="line"></div>
  <table>
    <tr><td>No. Pesanan</td><td class="right">${escapeHtml(order.code)}</td></tr>
    <tr><td>Waktu</td><td class="right">${escapeHtml(formatDateTime(order.createdAt))}</td></tr>
    <tr><td>Kasir</td><td class="right">${escapeHtml(order.cashier)}</td></tr>
    <tr><td>Tipe</td><td class="right">${escapeHtml(ORDER_TYPE_LABEL[order.type])}${order.tableNumber ? ` · ${escapeHtml(order.tableNumber)}` : ""}</td></tr>
    <tr><td>Pelanggan</td><td class="right">${escapeHtml(order.customerName ?? "Walk-in")}</td></tr>
  </table>
  <div class="line"></div>
  <table>${receiptItemRows(order.items)}</table>
  ${order.note ? `<div class="line"></div><div class="muted">Catatan pesanan: ${escapeHtml(order.note)}</div>` : ""}
  <div class="line"></div>
  <table>
    <tr><td>Subtotal</td><td class="right">${formatRupiah(order.subtotal)}</td></tr>
    ${order.discount > 0 ? `<tr><td>Diskon</td><td class="right">-${formatRupiah(order.discount)}</td></tr>` : ""}
    <tr><td>Pajak</td><td class="right">${formatRupiah(order.tax)}</td></tr>
    ${order.serviceFee > 0 ? `<tr><td>Biaya layanan</td><td class="right">${formatRupiah(order.serviceFee)}</td></tr>` : ""}
    ${order.deliveryFee > 0 ? `<tr><td>Biaya antar</td><td class="right">${formatRupiah(order.deliveryFee)}</td></tr>` : ""}
    <tr class="total"><td>Total</td><td class="right">${formatRupiah(order.total)}</td></tr>
    <tr><td>Bayar</td><td class="right">${escapeHtml(paymentLine)}</td></tr>
    <tr><td>Status</td><td class="right">${escapeHtml(PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus)}</td></tr>
    ${paidRows}
  </table>
  <div class="line"></div>
  <div class="center">
    <span class="badge">${escapeHtml(ORDER_STATUS_LABEL[order.status])}</span>
    <p class="muted">Terima kasih sudah ngopi di Semoet!</p>
    <p class="muted">Simpan struk ini sebagai bukti pembayaran.</p>
  </div>
</body>
</html>`;
}

/**
 * HTML tiket produksi untuk dapur atau bar. Hanya berisi item stasiun
 * tersebut, tanpa harga, supaya mudah dibaca oleh koki/barista.
 */
export function buildStationTicketHtml(
  order: Order,
  station: TicketStation,
  items: CartItem[],
  paperWidth: 58 | 80 = 80,
): string {
  const title = station === "bar" ? "TIKET BAR" : "TIKET DAPUR";
  const subtitle = station === "bar" ? "Minuman" : "Makanan";
  const pageWidth = paperWidth === 58 ? "58mm" : "80mm";
  const orderNote = order.note
    ? `<div class="line"></div><div class="note">CATATAN PESANAN: ${escapeHtml(order.note)}</div>`
    : "";

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${title} ${escapeHtml(order.code)}</title>
  <style>${TICKET_STYLE}
    body { width: ${pageWidth}; }
  </style>
</head>
<body>
  <div class="center">
    <div class="brand">${title}</div>
    <div class="muted">${escapeHtml(order.branchName ?? "Semoet Cafe")} · ${subtitle}</div>
  </div>
  <div class="line"></div>
  <table>
    <tr><td>No. Pesanan</td><td class="right">${escapeHtml(order.code)}</td></tr>
    <tr><td>Waktu</td><td class="right">${escapeHtml(formatDateTime(order.createdAt))}</td></tr>
    <tr><td>Tipe</td><td class="right">${escapeHtml(ORDER_TYPE_LABEL[order.type])}${order.tableNumber ? ` · ${escapeHtml(order.tableNumber)}` : ""}</td></tr>
    <tr><td>Pelanggan</td><td class="right">${escapeHtml(order.customerName ?? "Walk-in")}</td></tr>
  </table>
  <div class="line"></div>
  <div>${ticketItems(items)}</div>
  ${orderNote}
  <div class="line"></div>
  <div class="center">
    <span class="badge">${escapeHtml(ORDER_STATUS_LABEL[order.status])}</span>
  </div>
</body>
</html>`;
}

/**
 * Cetak HTML lewat iframe tersembunyi. Ini menghindari popup blocker dan
 * membuat halaman kasir tidak ikut tercetak.
 */
export function printHtmlDocument(html: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => iframe.remove(), 500);
      resolve();
    };

    iframe.onload = () => {
      const target = iframe.contentWindow;
      if (!target) {
        finish();
        return;
      }
      try {
        target.focus();
        target.addEventListener("afterprint", finish, { once: true });
        target.print();
      } catch {
        // Biarkan fallback timeout menyelesaikan antrean.
      }
      // Sebagian browser tidak mengirim afterprint. Jangan menggantung
      // antrean cetak terlalu lama.
      window.setTimeout(finish, 5_000);
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

/** Cetak struk ke jendela/iframe cetak (ukuran kertas thermal 80mm). */
export function printReceipt(order: Order): void {
  void printHtmlDocument(buildReceiptHtml(order));
}

/** Cetak tiket dapur (tanpa harga) untuk seluruh item pesanan. */
export function printKitchenTicket(order: Order): void {
  void printHtmlDocument(
    buildStationTicketHtml(order, "kitchen", order.items),
  );
}

/** Cetak tiket bar (tanpa harga) untuk item minuman. */
export function printBarTicket(order: Order, items?: CartItem[]): void {
  void printHtmlDocument(
    buildStationTicketHtml(order, "bar", items ?? order.items),
  );
}
