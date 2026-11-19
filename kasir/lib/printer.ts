"use client";

import {
  formatDateTime,
  formatRupiah,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "./format";
import {
  buildReceiptHtml,
  buildStationTicketHtml,
  printHtmlDocument,
  type TicketStation,
} from "./print";
import type { CartItem, Order, Product } from "./types";

export type PrintStation = "cashier" | "kitchen" | "bar";
export type PrinterMode = "browser" | "serial";
export type PaperWidth = 58 | 80;

export interface PrinterSettings {
  mode: PrinterMode;
  baudRate: number;
  paperWidth: PaperWidth;
  autoPrint: Record<PrintStation, boolean>;
  /** Nama kategori produk -> stasiun tujuan. "none" = jangan dicetak. */
  categoryStations: Record<string, PrintStation | "none">;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialConnectionInfo {
  supported: boolean;
  connected: boolean;
  portInfo: SerialPortInfo | null;
}

const SETTINGS_KEY = "semoet.kasir.printerSettings";

const DEFAULT_SETTINGS: PrinterSettings = {
  mode: "browser",
  baudRate: 9600,
  paperWidth: 80,
  autoPrint: {
    cashier: true,
    kitchen: true,
    bar: true,
  },
  categoryStations: {},
};

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

export function defaultPrinterSettings(): PrinterSettings {
  return {
    ...DEFAULT_SETTINGS,
    autoPrint: { ...DEFAULT_SETTINGS.autoPrint },
    categoryStations: {},
  };
}

function normalizeSettings(
  value: Partial<PrinterSettings> | null | undefined,
): PrinterSettings {
  const fallback = defaultPrinterSettings();
  if (!value) return fallback;

  return {
    mode: value.mode === "serial" ? "serial" : "browser",
    baudRate:
      typeof value.baudRate === "number" && Number.isFinite(value.baudRate)
        ? value.baudRate
        : fallback.baudRate,
    paperWidth: value.paperWidth === 58 ? 58 : 80,
    autoPrint: {
      cashier: value.autoPrint?.cashier ?? fallback.autoPrint.cashier,
      kitchen: value.autoPrint?.kitchen ?? fallback.autoPrint.kitchen,
      bar: value.autoPrint?.bar ?? fallback.autoPrint.bar,
    },
    categoryStations:
      value.categoryStations && typeof value.categoryStations === "object"
        ? { ...value.categoryStations }
        : {},
  };
}

export function loadPrinterSettings(): PrinterSettings {
  if (typeof window === "undefined") return defaultPrinterSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultPrinterSettings();
    return normalizeSettings(JSON.parse(raw) as Partial<PrinterSettings>);
  } catch {
    return defaultPrinterSettings();
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage bisa diblokir; pengaturan tetap berlaku di sesi ini.
  }
}

// ---------------------------------------------------------------------------
// Web Serial (ESC/POS)
// ---------------------------------------------------------------------------

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): SerialPortInfo;
  addEventListener?(type: "disconnect", listener: () => void): void;
  removeEventListener?(type: "disconnect", listener: () => void): void;
}

interface SerialApiLike {
  requestPort(options?: {
    filters?: { usbVendorId?: number }[];
  }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

function getSerialApi(): SerialApiLike | null {
  if (typeof navigator === "undefined") return null;
  return (
    (navigator as Navigator & { serial?: SerialApiLike }).serial ?? null
  );
}

export function isSerialSupported(): boolean {
  return getSerialApi() !== null;
}

let activePort: SerialPortLike | null = null;
let activePortInfo: SerialPortInfo | null = null;
let activeDisconnectHandler: (() => void) | null = null;

function attachPort(port: SerialPortLike): void {
  if (activePort && activeDisconnectHandler && activePort.removeEventListener) {
    activePort.removeEventListener("disconnect", activeDisconnectHandler);
  }

  activePort = port;
  activePortInfo = port.getInfo?.() ?? null;
  activeDisconnectHandler = () => {
    if (activePort === port) {
      activePort = null;
      activePortInfo = null;
      activeDisconnectHandler = null;
    }
  };
  port.addEventListener?.("disconnect", activeDisconnectHandler);
}

export function getSerialConnectionInfo(): SerialConnectionInfo {
  return {
    supported: isSerialSupported(),
    connected: activePort !== null,
    portInfo: activePortInfo,
  };
}

/**
 * Minta izin dan buka printer USB serial. Harus dipanggil dari klik pengguna
 * karena browser mensyaratkan user activation untuk `requestPort()`.
 */
export async function connectSerialPrinter(
  baudRate: number,
): Promise<SerialPortInfo | null> {
  const serial = getSerialApi();
  if (!serial) {
    throw new Error(
      "Browser ini tidak mendukung Web Serial. Gunakan Chrome atau Edge versi desktop.",
    );
  }

  if (activePort) return activePortInfo;

  const port = await serial.requestPort();
  try {
    await port.open({ baudRate });
  } catch (error) {
    try {
      await port.close();
    } catch {
      // abaikan
    }
    throw new Error(
      error instanceof Error
        ? `Gagal membuka printer: ${error.message}`
        : "Gagal membuka printer serial.",
    );
  }

  attachPort(port);
  return activePortInfo;
}

/**
 * Sambungkan ulang printer yang izinnya sudah pernah diberikan. Dipakai saat
 * halaman printer dibuka kembali atau saat auto-print pertama berjalan.
 */
export async function reconnectSerialPrinter(
  baudRate: number,
): Promise<SerialPortInfo | null> {
  if (activePort) return activePortInfo;

  const serial = getSerialApi();
  if (!serial) {
    throw new Error(
      "Browser ini tidak mendukung Web Serial. Gunakan Chrome atau Edge versi desktop.",
    );
  }

  const ports = await serial.getPorts();
  if (ports.length === 0) {
    throw new Error(
      "Printer belum pernah dihubungkan. Buka halaman Printer lalu klik Hubungkan printer.",
    );
  }

  const port = ports[0];
  try {
    await port.open({ baudRate });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Gagal menyambungkan printer: ${error.message}`
        : "Gagal menyambungkan printer serial.",
    );
  }

  attachPort(port);
  return activePortInfo;
}

export async function disconnectSerialPrinter(): Promise<void> {
  const port = activePort;
  activePort = null;
  activePortInfo = null;

  if (activeDisconnectHandler && port?.removeEventListener) {
    port.removeEventListener("disconnect", activeDisconnectHandler);
  }
  activeDisconnectHandler = null;

  if (!port) return;
  try {
    await port.close();
  } catch {
    // Printer mungkin sudah terputus secara fisik.
  }
}

async function ensureSerialReady(baudRate: number): Promise<SerialPortLike> {
  if (!activePort) {
    await reconnectSerialPrinter(baudRate);
  }
  if (!activePort) {
    throw new Error(
      "Printer serial belum terhubung. Buka halaman Printer untuk menghubungkan.",
    );
  }
  return activePort;
}

let serialQueue: Promise<void> = Promise.resolve();

function enqueueSerial(task: () => Promise<void>): Promise<void> {
  const next = serialQueue.then(task, task);
  serialQueue = next.catch(() => undefined);
  return next;
}

async function writeSerialBytes(
  bytes: Uint8Array,
  baudRate: number,
): Promise<void> {
  return enqueueSerial(async () => {
    const port = await ensureSerialReady(baudRate);
    const writable = port.writable;
    if (!writable) {
      throw new Error(
        "Printer serial tidak bisa menerima data. Cabut lalu hubungkan ulang printer.",
      );
    }

    const writer = writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  });
}

// ---------------------------------------------------------------------------
// ESC/POS
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function transliterate(value: string): string {
  return value
    .replaceAll("é", "e")
    .replaceAll("è", "e")
    .replaceAll("á", "a")
    .replaceAll("à", "a")
    .replaceAll("í", "i")
    .replaceAll("ó", "o")
    .replaceAll("ú", "u")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("×", "x")
    .replaceAll("·", ".");
}

class EscPosBuilder {
  private readonly bytes: number[] = [];
  readonly width: number;

  constructor(width: number) {
    this.width = width;
  }

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  text(value: string): this {
    const text = transliterate(value);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      // ESC/POS default code page mendukung ASCII. Karakter lain diganti "?".
      this.bytes.push(code >= 32 && code <= 255 ? code : 63);
    }
    return this;
  }

  line(value = ""): this {
    this.text(value);
    this.bytes.push(LF);
    return this;
  }

  align(alignment: 0 | 1 | 2): this {
    return this.raw(ESC, 0x61, alignment);
  }

  bold(enabled: boolean): this {
    return this.raw(ESC, 0x45, enabled ? 1 : 0);
  }

  doubleSize(enabled: boolean): this {
    return this.raw(GS, 0x21, enabled ? 0x11 : 0x00);
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }

  rule(character = "-"): this {
    return this.line(character.repeat(this.width));
  }

  cut(): this {
    this.feed(2);
    return this.raw(GS, 0x56, 0x42, 0x00);
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function wrapText(text: string, width: number): string[] {
  const normalized = transliterate(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      if (word.length <= width) {
        current = word;
      } else {
        for (let index = 0; index < word.length; index += width) {
          lines.push(word.slice(index, index + width));
        }
      }
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word.length <= width ? word : "";
      if (word.length > width) {
        for (let index = 0; index < word.length; index += width) {
          const chunk = word.slice(index, index + width);
          if (index + width < word.length) lines.push(chunk);
          else current = chunk;
        }
      }
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function rightAlign(text: string, width: number): string {
  const clean = transliterate(text);
  if (clean.length >= width) return clean.slice(0, width);
  return `${" ".repeat(width - clean.length)}${clean}`;
}

function twoColumn(left: string, right: string, width: number): string[] {
  const cleanLeft = transliterate(left);
  const cleanRight = transliterate(right);
  if (cleanLeft.length + cleanRight.length + 1 <= width) {
    return [
      `${cleanLeft}${" ".repeat(width - cleanLeft.length - cleanRight.length)}${cleanRight}`,
    ];
  }
  return [...wrapText(cleanLeft, width), rightAlign(cleanRight, width)];
}

function writeTwoColumn(
  builder: EscPosBuilder,
  left: string,
  right: string,
): void {
  for (const line of twoColumn(left, right, builder.width)) {
    builder.line(line);
  }
}

function writeWrapped(
  builder: EscPosBuilder,
  text: string,
  indent = "",
): void {
  const lines = wrapText(text, Math.max(8, builder.width - indent.length));
  lines.forEach((line, index) => {
    builder.line(`${index === 0 ? indent : " ".repeat(indent.length)}${line}`);
  });
}

function writeItem(
  builder: EscPosBuilder,
  item: CartItem,
  showPrice: boolean,
): void {
  const variant = item.variantName ? ` (${item.variantName})` : "";
  const name = `${item.qty}x ${item.name}${variant}`;
  const cleanName = transliterate(name);
  const price = formatRupiah(item.price * item.qty);

  if (showPrice && cleanName.length + price.length + 1 <= builder.width) {
    builder.line(
      `${cleanName}${" ".repeat(
        builder.width - cleanName.length - price.length,
      )}${price}`,
    );
  } else {
    writeWrapped(builder, name);
    if (showPrice) builder.line(rightAlign(price, builder.width));
  }

  for (const modifier of item.modifiers) {
    writeWrapped(
      builder,
      `+ ${modifier.groupName}: ${modifier.name}`,
      "  ",
    );
  }
  if (item.note) {
    writeWrapped(builder, `Catatan: ${item.note}`, "  ");
  }
}

function writeOrderInfo(builder: EscPosBuilder, order: Order): void {
  writeTwoColumn(builder, "No. Pesanan", order.code);
  writeTwoColumn(builder, "Waktu", formatDateTime(order.createdAt));
  writeTwoColumn(
    builder,
    "Tipe",
    `${ORDER_TYPE_LABEL[order.type]}${order.tableNumber ? ` / ${order.tableNumber}` : ""}`,
  );
  writeTwoColumn(builder, "Pelanggan", order.customerName ?? "Walk-in");
}

function buildEscPosReceipt(order: Order, paperWidth: PaperWidth): Uint8Array {
  const builder = new EscPosBuilder(paperWidth === 58 ? 32 : 48);

  builder.raw(ESC, 0x40);
  builder.align(1).bold(true).doubleSize(true);
  builder.line("SEMOET CAFE");
  builder.doubleSize(false).bold(false);
  builder.line(order.branchName ?? "Semoet Cafe");
  builder.align(0).rule();

  writeOrderInfo(builder, order);
  writeTwoColumn(builder, "Kasir", order.cashier);
  builder.rule();

  for (const item of order.items) {
    writeItem(builder, item, true);
  }

  if (order.note) {
    builder.rule();
    writeWrapped(builder, `Catatan pesanan: ${order.note}`);
  }

  builder.rule();
  writeTwoColumn(builder, "Subtotal", formatRupiah(order.subtotal));
  if (order.discount > 0) {
    writeTwoColumn(builder, "Diskon", `-${formatRupiah(order.discount)}`);
  }
  writeTwoColumn(builder, "Pajak", formatRupiah(order.tax));
  if (order.serviceFee > 0) {
    writeTwoColumn(builder, "Biaya layanan", formatRupiah(order.serviceFee));
  }
  if (order.deliveryFee > 0) {
    writeTwoColumn(builder, "Biaya antar", formatRupiah(order.deliveryFee));
  }
  builder.bold(true);
  writeTwoColumn(builder, "TOTAL", formatRupiah(order.total));
  builder.bold(false);

  writeTwoColumn(
    builder,
    "Bayar",
    order.paymentMethod
      ? PAYMENT_METHOD_LABEL[order.paymentMethod]
      : "Belum dibayar",
  );
  writeTwoColumn(
    builder,
    "Status",
    PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus,
  );
  if (order.paymentStatus === "paid") {
    writeTwoColumn(builder, "Diterima", formatRupiah(order.paidAmount));
    writeTwoColumn(builder, "Kembalian", formatRupiah(order.change));
  }

  builder.rule();
  builder.align(1);
  builder.line(`[${ORDER_STATUS_LABEL[order.status]}]`);
  builder.line("Terima kasih sudah ngopi di Semoet!");
  builder.line("Simpan struk ini sebagai bukti pembayaran.");
  builder.align(0);
  builder.cut();

  return builder.build();
}

function buildEscPosTicket(
  order: Order,
  station: TicketStation,
  items: CartItem[],
  paperWidth: PaperWidth,
): Uint8Array {
  const builder = new EscPosBuilder(paperWidth === 58 ? 32 : 48);
  const title = station === "bar" ? "TIKET BAR" : "TIKET DAPUR";
  const subtitle = station === "bar" ? "Minuman" : "Makanan";

  builder.raw(ESC, 0x40);
  builder.align(1).bold(true).doubleSize(true);
  builder.line(title);
  builder.doubleSize(false).bold(false);
  builder.line(`${order.branchName ?? "Semoet Cafe"} / ${subtitle}`);
  builder.align(0).rule();

  writeOrderInfo(builder, order);
  builder.rule();

  for (const item of items) {
    writeItem(builder, item, false);
  }

  if (order.note) {
    builder.rule();
    writeWrapped(builder, `Catatan pesanan: ${order.note}`);
  }

  builder.rule();
  builder.align(1);
  builder.line(`[${ORDER_STATUS_LABEL[order.status]}]`);
  builder.align(0);
  builder.cut();

  return builder.build();
}

// ---------------------------------------------------------------------------
// Routing item ke stasiun
// ---------------------------------------------------------------------------

const BAR_PATTERN =
  /(kopi|coffee|espresso|latte|americano|cappuccino|mocha|macchiato|teh|tea|matcha|chocolate|choco|jus|juice|smoothie|soda|mocktail|minuman|drink|beverage|shake|frappe|frappuccino|lemonade|yakult|susu|milk|bar)/i;

const KITCHEN_PATTERN =
  /(makan|food|nasi|rice|ayam|chicken|mie|noodle|pasta|burger|sandwich|roti|bread|kue|cake|pastry|croissant|bomboloni|donut|dessert|snack|camilan|fries|kentang|soup|salad|pizza|steak|telur|egg|dapur|kitchen)/i;

export function inferStation(
  categoryName: string,
  productName = "",
): PrintStation {
  const text = `${categoryName} ${productName}`;
  if (KITCHEN_PATTERN.test(text)) return "kitchen";
  if (BAR_PATTERN.test(text)) return "bar";
  // Default aman: makanan/minuman yang tidak dikenali masuk dapur.
  return "kitchen";
}

export interface StationGroups {
  kitchen: CartItem[];
  bar: CartItem[];
  unassigned: CartItem[];
}

export function groupItemsByStation(
  items: CartItem[],
  products: Product[],
  settings: PrinterSettings,
): StationGroups {
  const productById = new Map(products.map((product) => [product.id, product]));

  const groups: StationGroups = {
    kitchen: [],
    bar: [],
    unassigned: [],
  };

  for (const item of items) {
    const product = productById.get(item.productId);
    const categoryName = product?.categoryName ?? "";
    const explicit = categoryName
      ? settings.categoryStations[categoryName]
      : undefined;

    if (explicit === "none") {
      groups.unassigned.push(item);
      continue;
    }

    const station =
      explicit === "kitchen" || explicit === "bar"
        ? explicit
        : inferStation(categoryName, item.name);

    if (station === "bar") groups.bar.push(item);
    else groups.kitchen.push(item);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Cetak
// ---------------------------------------------------------------------------

export interface AutoPrintResult {
  printed: PrintStation[];
  skipped: PrintStation[];
}

export async function printOrderStation(
  order: Order,
  station: PrintStation,
  items: CartItem[] = order.items,
  settings: PrinterSettings = loadPrinterSettings(),
): Promise<void> {
  if (station !== "cashier" && items.length === 0) return;

  if (settings.mode === "serial") {
    const bytes =
      station === "cashier"
        ? buildEscPosReceipt(order, settings.paperWidth)
        : buildEscPosTicket(
            order,
            station,
            items,
            settings.paperWidth,
          );
    await writeSerialBytes(bytes, settings.baudRate);
    return;
  }

  const html =
    station === "cashier"
      ? buildReceiptHtml(order)
      : buildStationTicketHtml(order, station, items);
  await printHtmlDocument(html);
}

/**
 * Dipanggil setelah kasir menerima pesanan. Tiket dapur/bar hanya dibuat
 * untuk item yang memang dipetakan ke stasiun tersebut.
 */
export async function autoPrintAcceptedOrder(
  order: Order,
  products: Product[],
): Promise<AutoPrintResult> {
  const settings = loadPrinterSettings();
  const groups = groupItemsByStation(order.items, products, settings);
  const printed: PrintStation[] = [];
  const skipped: PrintStation[] = [];

  const jobs: { station: PrintStation; items: CartItem[] }[] = [];
  if (settings.autoPrint.kitchen) {
    if (groups.kitchen.length > 0) {
      jobs.push({ station: "kitchen", items: groups.kitchen });
    } else {
      skipped.push("kitchen");
    }
  }
  if (settings.autoPrint.bar) {
    if (groups.bar.length > 0) {
      jobs.push({ station: "bar", items: groups.bar });
    } else {
      skipped.push("bar");
    }
  }
  if (settings.autoPrint.cashier) {
    jobs.push({ station: "cashier", items: order.items });
  }

  for (const job of jobs) {
    await printOrderStation(order, job.station, job.items, settings);
    printed.push(job.station);
  }

  return { printed, skipped };
}
