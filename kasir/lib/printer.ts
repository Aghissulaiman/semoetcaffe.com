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
export type PrinterMode = "browser" | "serial" | "bluetooth";
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

export interface BluetoothConnectionInfo {
  supported: boolean;
  connected: boolean;
  deviceName: string | null;
  canReconnect: boolean;
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
    mode:
      value.mode === "serial" || value.mode === "bluetooth"
        ? value.mode
        : "browser",
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
      notifyPrinterChanged();
    }
  };
  port.addEventListener?.("disconnect", activeDisconnectHandler);
  notifyPrinterChanged();
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

  if (!port) {
    notifyPrinterChanged();
    return;
  }
  try {
    await port.close();
  } catch {
    // Printer mungkin sudah terputus secara fisik.
  }
  notifyPrinterChanged();
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
// Web Bluetooth (ESC/POS BLE)
// ---------------------------------------------------------------------------

interface BluetoothCharacteristicLike {
  uuid: string;
  properties?: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValue?(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
}

interface BluetoothServiceLike {
  uuid: string;
  getCharacteristic?(uuid: string): Promise<BluetoothCharacteristicLike>;
  getCharacteristics(): Promise<BluetoothCharacteristicLike[]>;
}

interface BluetoothServerLike {
  connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
  getPrimaryService?(uuid: string): Promise<BluetoothServiceLike>;
  getPrimaryServices(): Promise<BluetoothServiceLike[]>;
}

interface BluetoothDeviceLike {
  id: string;
  name?: string | null;
  gatt?: BluetoothServerLike;
  addEventListener?(
    type: "gattserverdisconnected",
    listener: () => void,
  ): void;
  removeEventListener?(
    type: "gattserverdisconnected",
    listener: () => void,
  ): void;
}

interface BluetoothApiLike {
  requestDevice(options?: {
    acceptAllDevices?: boolean;
    filters?: { services?: string[]; namePrefix?: string }[];
    optionalServices?: string[];
  }): Promise<BluetoothDeviceLike>;
  getDevices?(): Promise<BluetoothDeviceLike[]>;
}

/**
 * UUID yang umum dipakai printer thermal BLE. Web Bluetooth hanya bisa
 * mengakses BLE, bukan Bluetooth Classic/SPP. Kalau printer hanya SPP,
 * gunakan kabel USB atau mode dialog browser.
 */
const BLUETOOTH_PRINTER_PROFILES: {
  service: string;
  characteristic: string;
}[] = [
  {
    service: "000018f0-0000-1000-8000-00805f9b34fb",
    characteristic: "00002af1-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "0000ff00-0000-1000-8000-00805f9b34fb",
    characteristic: "0000ff02-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "0000fff0-0000-1000-8000-00805f9b34fb",
    characteristic: "0000fff2-0000-1000-8000-00805f9b34fb",
  },
  {
    service: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    characteristic: "49535343-8841-43f4-a8d4-ecbe34729bb3",
  },
  {
    service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    characteristic: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  },
];

const BLUETOOTH_OPTIONAL_SERVICES = [
  ...new Set(BLUETOOTH_PRINTER_PROFILES.map((profile) => profile.service)),
];

const NON_PRINTER_SERVICES = new Set([
  "00001800-0000-1000-8000-00805f9b34fb",
  "00001801-0000-1000-8000-00805f9b34fb",
  "0000180a-0000-1000-8000-00805f9b34fb",
  "0000180f-0000-1000-8000-00805f9b34fb",
  "00001812-0000-1000-8000-00805f9b34fb",
]);

const BLUETOOTH_DEVICE_KEY = "semoet.kasir.bluetoothDeviceId";

function getBluetoothApi(): BluetoothApiLike | null {
  if (typeof navigator === "undefined") return null;
  return (
    (navigator as Navigator & { bluetooth?: BluetoothApiLike }).bluetooth ??
    null
  );
}

export function isBluetoothSupported(): boolean {
  return getBluetoothApi() !== null;
}

export function canReconnectBluetooth(): boolean {
  const api = getBluetoothApi();
  return Boolean(api && typeof api.getDevices === "function");
}

let activeBluetoothDevice: BluetoothDeviceLike | null = null;
let activeBluetoothCharacteristic: BluetoothCharacteristicLike | null = null;
let activeBluetoothName: string | null = null;
let bluetoothDisconnectHandler: (() => void) | null = null;

function notifyPrinterChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("semoet:printer-changed"));
}

function loadLastBluetoothDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BLUETOOTH_DEVICE_KEY);
  } catch {
    return null;
  }
}

function saveLastBluetoothDeviceId(deviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BLUETOOTH_DEVICE_KEY, deviceId);
  } catch {
    // localStorage bisa diblokir; koneksi tetap berjalan di sesi ini.
  }
}

function isWritableCharacteristic(
  characteristic: BluetoothCharacteristicLike,
): boolean {
  return (
    typeof characteristic.writeValueWithoutResponse === "function" ||
    typeof characteristic.writeValue === "function"
  );
}

function attachBluetoothDevice(
  device: BluetoothDeviceLike,
  characteristic: BluetoothCharacteristicLike,
): void {
  if (
    activeBluetoothDevice &&
    activeBluetoothDevice !== device &&
    bluetoothDisconnectHandler
  ) {
    activeBluetoothDevice.removeEventListener?.(
      "gattserverdisconnected",
      bluetoothDisconnectHandler,
    );
  }

  activeBluetoothDevice = device;
  activeBluetoothCharacteristic = characteristic;
  activeBluetoothName = device.name?.trim() || "Printer Bluetooth";

  bluetoothDisconnectHandler = () => {
    if (activeBluetoothDevice !== device) return;
    activeBluetoothDevice = null;
    activeBluetoothCharacteristic = null;
    activeBluetoothName = null;
    bluetoothDisconnectHandler = null;
    notifyPrinterChanged();
  };

  device.addEventListener?.(
    "gattserverdisconnected",
    bluetoothDisconnectHandler,
  );
}

export function getBluetoothConnectionInfo(): BluetoothConnectionInfo {
  return {
    supported: isBluetoothSupported(),
    connected: Boolean(
      activeBluetoothDevice?.gatt?.connected &&
        activeBluetoothCharacteristic,
    ),
    deviceName: activeBluetoothName,
    canReconnect: canReconnectBluetooth(),
  };
}

async function findBluetoothCharacteristic(
  device: BluetoothDeviceLike,
): Promise<BluetoothCharacteristicLike> {
  const server = device.gatt;
  if (!server) {
    throw new Error(
      "Perangkat Bluetooth ini tidak menyediakan layanan GATT untuk mencetak.",
    );
  }

  if (!server.connected) {
    try {
      await server.connect();
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Gagal menyambungkan Bluetooth: ${error.message}`
          : "Gagal menyambungkan printer Bluetooth.",
      );
    }
  }

  // Coba profil printer yang paling umum lebih dulu.
  for (const profile of BLUETOOTH_PRINTER_PROFILES) {
    try {
      const service = server.getPrimaryService
        ? await server.getPrimaryService(profile.service)
        : undefined;
      if (!service) continue;

      let characteristic: BluetoothCharacteristicLike | undefined;
      if (service.getCharacteristic) {
        try {
          characteristic = await service.getCharacteristic(
            profile.characteristic,
          );
        } catch {
          // Karakteristik tidak ada di layanan ini; coba daftar karakteristik.
        }
      }
      if (!characteristic) {
        const characteristics = await service.getCharacteristics();
        characteristic = characteristics.find(
          (item) =>
            item.uuid.toLowerCase() ===
            profile.characteristic.toLowerCase(),
        );
      }

      if (characteristic && isWritableCharacteristic(characteristic)) {
        return characteristic;
      }
    } catch {
      // Layanan tidak tersedia di perangkat ini; lanjut ke profil berikutnya.
    }
  }

  // Fallback: pakai karakteristik writable pertama yang bisa diakses.
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      if (NON_PRINTER_SERVICES.has(service.uuid.toLowerCase())) continue;
      try {
        const characteristics = await service.getCharacteristics();
        const writable = characteristics.find(isWritableCharacteristic);
        if (writable) return writable;
      } catch {
        // Layanan ini tidak memberi izin akses; lanjut.
      }
    }
  } catch {
    // Sebagian perangkat tidak mengizinkan enumerasi semua layanan.
  }

  throw new Error(
    "Printer Bluetooth terhubung, tetapi kanal tulis ESC/POS tidak ditemukan. Pastikan printer mendukung BLE, atau gunakan kabel USB.",
  );
}

async function openBluetoothDevice(
  device: BluetoothDeviceLike,
): Promise<void> {
  try {
    const characteristic = await findBluetoothCharacteristic(device);
    attachBluetoothDevice(device, characteristic);
  } catch (error) {
    try {
      if (device.gatt?.connected) device.gatt.disconnect();
    } catch {
      // Koneksi mungkin sudah tertutup.
    }
    throw error;
  }
}

export async function connectBluetoothPrinter(): Promise<BluetoothConnectionInfo> {
  const api = getBluetoothApi();
  if (!api) {
    throw new Error(
      "Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome atau Edge versi desktop melalui localhost atau HTTPS.",
    );
  }

  if (
    activeBluetoothCharacteristic &&
    activeBluetoothDevice?.gatt?.connected
  ) {
    return getBluetoothConnectionInfo();
  }

  let device: BluetoothDeviceLike;
  try {
    device = await api.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLUETOOTH_OPTIONAL_SERVICES,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error(
        "Tidak ada printer Bluetooth yang dipilih. Pastikan printer menyala dan dalam mode pairing.",
      );
    }
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new Error(
        "Bluetooth hanya bisa diakses lewat localhost atau HTTPS di Chrome/Edge desktop.",
      );
    }
    throw new Error(
      error instanceof Error
        ? `Gagal memilih printer Bluetooth: ${error.message}`
        : "Gagal memilih printer Bluetooth.",
    );
  }

  await openBluetoothDevice(device);
  saveLastBluetoothDeviceId(device.id);
  notifyPrinterChanged();
  return getBluetoothConnectionInfo();
}

export async function reconnectBluetoothPrinter(): Promise<BluetoothConnectionInfo> {
  if (
    activeBluetoothCharacteristic &&
    activeBluetoothDevice?.gatt?.connected
  ) {
    return getBluetoothConnectionInfo();
  }

  const api = getBluetoothApi();
  if (!api) {
    throw new Error(
      "Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome atau Edge versi desktop melalui localhost atau HTTPS.",
    );
  }
  if (typeof api.getDevices !== "function") {
    throw new Error(
      "Browser ini belum mendukung sambung ulang otomatis. Klik Hubungkan Bluetooth untuk memilih printer.",
    );
  }

  let devices: BluetoothDeviceLike[] = [];
  try {
    devices = await api.getDevices();
  } catch {
    throw new Error(
      "Izin Bluetooth tidak tersedia. Klik Hubungkan Bluetooth untuk memilih printer.",
    );
  }

  if (devices.length === 0) {
    throw new Error(
      "Belum ada printer Bluetooth yang diizinkan. Buka halaman Printer lalu klik Hubungkan Bluetooth.",
    );
  }

  const lastDeviceId = loadLastBluetoothDeviceId();
  const device =
    devices.find((item) => item.id === lastDeviceId) ?? devices[0];

  await openBluetoothDevice(device);
  saveLastBluetoothDeviceId(device.id);
  notifyPrinterChanged();
  return getBluetoothConnectionInfo();
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  const device = activeBluetoothDevice;
  if (device && bluetoothDisconnectHandler) {
    device.removeEventListener?.(
      "gattserverdisconnected",
      bluetoothDisconnectHandler,
    );
  }

  activeBluetoothDevice = null;
  activeBluetoothCharacteristic = null;
  activeBluetoothName = null;
  bluetoothDisconnectHandler = null;
  notifyPrinterChanged();

  try {
    if (device?.gatt?.connected) device.gatt.disconnect();
  } catch {
    // Perangkat mungkin sudah terputus secara fisik.
  }
}

async function ensureBluetoothReady(): Promise<BluetoothCharacteristicLike> {
  if (
    activeBluetoothCharacteristic &&
    activeBluetoothDevice?.gatt?.connected
  ) {
    return activeBluetoothCharacteristic;
  }

  activeBluetoothCharacteristic = null;
  await reconnectBluetoothPrinter();

  if (!activeBluetoothCharacteristic) {
    throw new Error(
      "Printer Bluetooth belum terhubung. Buka halaman Printer untuk menghubungkan.",
    );
  }
  return activeBluetoothCharacteristic;
}

let bluetoothQueue: Promise<void> = Promise.resolve();

function enqueueBluetooth(task: () => Promise<void>): Promise<void> {
  const next = bluetoothQueue.then(task, task);
  bluetoothQueue = next.catch(() => undefined);
  return next;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function writeBluetoothChunk(
  characteristic: BluetoothCharacteristicLike,
  chunk: Uint8Array,
): Promise<void> {
  const properties = characteristic.properties;

  // Kalau browser memberi tahu bahwa write-without-response tidak didukung,
  // langsung pakai write-with-response.
  if (
    properties?.writeWithoutResponse === false &&
    properties.write !== false &&
    characteristic.writeValue
  ) {
    await characteristic.writeValue(chunk);
    return;
  }

  if (characteristic.writeValueWithoutResponse) {
    try {
      await characteristic.writeValueWithoutResponse(chunk);
      return;
    } catch (error) {
      if (!characteristic.writeValue) throw error;
      // Sebagian printer menolak write-without-response; coba dengan respons.
    }
  }

  if (characteristic.writeValue) {
    await characteristic.writeValue(chunk);
    return;
  }

  throw new Error(
    "Printer Bluetooth tidak punya kanal tulis. Gunakan kabel USB.",
  );
}

async function writeBluetoothBytes(bytes: Uint8Array): Promise<void> {
  return enqueueBluetooth(async () => {
    const characteristic = await ensureBluetoothReady();
    // 20 byte adalah ukuran aman sebelum MTU dinegosiasikan. Jeda kecil
    // mencegah buffer printer BLE penuh saat struk panjang.
    const chunkSize = 20;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.slice(offset, offset + chunkSize);
      await writeBluetoothChunk(characteristic, chunk);

      if (offset + chunkSize < bytes.length) await delay(15);
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
    .replaceAll("·", ".")
    .replaceAll("\u00a0", " ");
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

const STATION_LABEL: Record<PrintStation, string> = {
  cashier: "Kasir",
  kitchen: "Dapur",
  bar: "Bar",
};

export async function printOrderStation(
  order: Order,
  station: PrintStation,
  items: CartItem[] = order.items,
  settings: PrinterSettings = loadPrinterSettings(),
): Promise<void> {
  if (station !== "cashier" && items.length === 0) return;

  if (settings.mode === "serial" || settings.mode === "bluetooth") {
    const bytes =
      station === "cashier"
        ? buildEscPosReceipt(order, settings.paperWidth)
        : buildEscPosTicket(
            order,
            station,
            items,
            settings.paperWidth,
          );

    if (settings.mode === "serial") {
      await writeSerialBytes(bytes, settings.baudRate);
    } else {
      await writeBluetoothBytes(bytes);
    }
    return;
  }

  const html =
    station === "cashier"
      ? buildReceiptHtml(order, settings.paperWidth)
      : buildStationTicketHtml(
          order,
          station,
          items,
          settings.paperWidth,
        );
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
  const errors: string[] = [];

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
    try {
      await printOrderStation(order, job.station, job.items, settings);
      printed.push(job.station);
    } catch (err) {
      errors.push(
        `${STATION_LABEL[job.station]}: ${
          err instanceof Error ? err.message : "gagal mencetak"
        }`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Cetak otomatis gagal — ${errors.join("; ")}`);
  }

  return { printed, skipped };
}
