"use client";

import {
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  ChefHat,
  Coffee,
  Loader2,
  Power,
  Printer,
  ReceiptText,
  RefreshCw,
  Settings2,
  Usb,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Field,
  PageHeader,
  PageLoader,
  Segmented,
  Select,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import {
  autoPrintAcceptedOrder,
  BAUD_RATES,
  connectBluetoothPrinter,
  connectSerialPrinter,
  defaultPrinterSettings,
  disconnectBluetoothPrinter,
  disconnectSerialPrinter,
  getBluetoothConnectionInfo,
  getSerialConnectionInfo,
  groupItemsByStation,
  inferStation,
  isBluetoothSupported,
  isSerialSupported,
  loadPrinterSettings,
  printOrderStation,
  reconnectBluetoothPrinter,
  reconnectSerialPrinter,
  savePrinterSettings,
  type BluetoothConnectionInfo,
  type PaperWidth,
  type PrintStation,
  type PrinterMode,
  type PrinterSettings,
  type SerialConnectionInfo,
  type SerialPortInfo,
} from "@/lib/printer";
import { useKasir } from "@/lib/store";

const STATION_LABEL: Record<PrintStation, string> = {
  cashier: "Kasir",
  kitchen: "Dapur",
  bar: "Bar",
};

const STATION_ICON: Record<PrintStation, typeof ReceiptText> = {
  cashier: ReceiptText,
  kitchen: ChefHat,
  bar: Coffee,
};

const STATION_OPTIONS: {
  value: PrintStation | "none";
  label: string;
  description: string;
}[] = [
  {
    value: "kitchen",
    label: "Dapur",
    description: "Makanan dan camilan",
  },
  {
    value: "bar",
    label: "Bar",
    description: "Kopi, teh, dan minuman",
  },
  {
    value: "none",
    label: "Tidak dicetak",
    description: "Hanya tampil di layar",
  },
];

function portLabel(info: SerialPortInfo | null): string {
  if (!info) return "Printer serial";
  const vendor = info.usbVendorId?.toString(16).padStart(4, "0");
  const product = info.usbProductId?.toString(16).padStart(4, "0");
  if (!vendor && !product) return "Printer serial USB";
  return `USB ${vendor ?? "----"}:${product ?? "----"}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function PrinterPage() {
  const { hydrated, orders, products, categories } = useKasir();
  const [settings, setSettings] = useState<PrinterSettings>(() =>
    defaultPrinterSettings(),
  );
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<SerialConnectionInfo>({
    supported: false,
    connected: false,
    portInfo: null,
  });
  const [bluetoothConnection, setBluetoothConnection] =
    useState<BluetoothConnectionInfo>({
      supported: false,
      connected: false,
      deviceName: null,
      canReconnect: false,
    });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Baca localStorage setelah mount supaya HTML server dan klien sama.
    const timer = window.setTimeout(() => {
      const stored = loadPrinterSettings();
      if (cancelled) return;
      setSettings(stored);
      setLoaded(true);
      setConnection(getSerialConnectionInfo());
      setBluetoothConnection(getBluetoothConnectionInfo());

      if (stored.mode === "serial" && isSerialSupported()) {
        void reconnectSerialPrinter(stored.baudRate)
          .then(() => {
            if (!cancelled) setConnection(getSerialConnectionInfo());
          })
          .catch(() => {
            // Belum ada izin / printer mati. Status tetap "belum terhubung".
          });
      }

      if (stored.mode === "bluetooth" && isBluetoothSupported()) {
        void reconnectBluetoothPrinter()
          .then(() => {
            if (!cancelled) setBluetoothConnection(getBluetoothConnectionInfo());
          })
          .catch(() => {
            // Belum ada izin / printer mati. Status tetap "belum terhubung".
          });
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Status koneksi bisa berubah karena printer dicabut/dimatikan atau karena
  // auto-print menyambung ulang perangkat. Samakan UI tanpa polling.
  useEffect(() => {
    const sync = () => {
      setConnection(getSerialConnectionInfo());
      setBluetoothConnection(getBluetoothConnectionInfo());
    };
    window.addEventListener("semoet:printer-changed", sync);
    return () => window.removeEventListener("semoet:printer-changed", sync);
  }, []);

  const latestOrder = orders[0] ?? null;

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const category of categories) names.add(category.name);
    for (const product of products) {
      if (product.categoryName) names.add(product.categoryName);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [categories, products]);

  const groups = useMemo(() => {
    if (!latestOrder) return null;
    return groupItemsByStation(
      latestOrder.items,
      products,
      settings,
    );
  }, [latestOrder, products, settings]);

  function persist(next: PrinterSettings) {
    setSettings(next);
    savePrinterSettings(next);
  }

  function updateAutoPrint(station: PrintStation, enabled: boolean) {
    persist({
      ...settings,
      autoPrint: { ...settings.autoPrint, [station]: enabled },
    });
  }

  function updateCategoryStation(
    categoryName: string,
    value: PrintStation | "none",
  ) {
    persist({
      ...settings,
      categoryStations: {
        ...settings.categoryStations,
        [categoryName]: value,
      },
    });
  }

  function syncConnections() {
    setConnection(getSerialConnectionInfo());
    setBluetoothConnection(getBluetoothConnectionInfo());
  }

  async function handleConnect() {
    if (busy) return;
    setBusy("connect");
    setError(null);
    setNotice(null);
    try {
      if (settings.mode === "bluetooth") {
        await connectBluetoothPrinter();
        setNotice(
          "Printer Bluetooth berhasil terhubung. Coba tes cetak di bawah.",
        );
      } else {
        await connectSerialPrinter(settings.baudRate);
        setNotice("Printer USB berhasil terhubung. Coba tes cetak di bawah.");
      }
      syncConnections();
    } catch (err) {
      setError(errorMessage(err, "Gagal menghubungkan printer."));
      syncConnections();
    } finally {
      setBusy(null);
    }
  }

  async function handleReconnect() {
    if (busy) return;
    setBusy("reconnect");
    setError(null);
    setNotice(null);
    try {
      if (settings.mode === "bluetooth") {
        await reconnectBluetoothPrinter();
      } else {
        await reconnectSerialPrinter(settings.baudRate);
      }
      syncConnections();
      setNotice("Printer tersambung kembali.");
    } catch (err) {
      setError(errorMessage(err, "Gagal menyambungkan ulang printer."));
      syncConnections();
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (busy) return;
    setBusy("disconnect");
    setError(null);
    setNotice(null);
    try {
      if (settings.mode === "bluetooth") {
        await disconnectBluetoothPrinter();
      } else {
        await disconnectSerialPrinter();
      }
      syncConnections();
      setNotice("Koneksi printer diputuskan.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTest(station: PrintStation) {
    if (busy || !latestOrder) return;
    setBusy(`test-${station}`);
    setError(null);
    setNotice(null);

    try {
      const items =
        station === "cashier"
          ? latestOrder.items
          : station === "kitchen"
            ? (groups?.kitchen ?? [])
            : (groups?.bar ?? []);

      if (station !== "cashier" && items.length === 0) {
        setError(
          `Pesanan terakhir tidak punya item ${STATION_LABEL[
            station
          ].toLowerCase()}. Ubah pemetaan kategori atau pilih pesanan lain.`,
        );
        return;
      }

      await printOrderStation(latestOrder, station, items, settings);
      setNotice(
        settings.mode !== "browser"
          ? `Tes tiket ${STATION_LABEL[station]} terkirim ke printer.`
          : `Dialog cetak tiket ${STATION_LABEL[station]} dibuka. Pilih printer lalu cetak.`,
      );
    } catch (err) {
      setError(errorMessage(err, "Tes cetak gagal."));
      syncConnections();
    } finally {
      setBusy(null);
    }
  }

  async function handleTestAll() {
    if (busy || !latestOrder) return;
    setBusy("test-all");
    setError(null);
    setNotice(null);

    try {
      const result = await autoPrintAcceptedOrder(latestOrder, products);
      const printed = result.printed.map(
        (station) => STATION_LABEL[station],
      );
      setNotice(
        printed.length > 0
          ? `Cetak otomatis terkirim: ${printed.join(", ")}.`
          : "Tidak ada tiket yang dicetak. Periksa pengaturan Cetak otomatis.",
      );
    } catch (err) {
      setError(errorMessage(err, "Tes cetak otomatis gagal."));
      syncConnections();
    } finally {
      setBusy(null);
    }
  }

  if (!hydrated || !loaded) return <PageLoader label="Memuat pengaturan printer…" />;

  const serialSupported = connection.supported;
  const bluetoothSupported = bluetoothConnection.supported;
  const connected =
    settings.mode === "serial"
      ? connection.connected
      : settings.mode === "bluetooth"
        ? bluetoothConnection.connected
        : false;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Printer"
        description="Hubungkan printer struk lewat kabel USB atau Bluetooth, lalu atur tiket otomatis untuk kasir, dapur, dan bar."
        actions={
          <Badge
            tone={
              settings.mode === "browser"
                ? "warning"
                : connected
                  ? "success"
                  : "default"
            }
          >
            {settings.mode === "browser"
              ? "Mode dialog manual"
              : settings.mode === "serial"
                ? connected
                  ? "USB terhubung"
                  : "USB belum terhubung"
                : connected
                  ? "Bluetooth terhubung"
                  : "Bluetooth belum terhubung"}
          </Badge>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-success/20 bg-success-soft px-3 py-2 text-xs font-semibold text-success">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section
          id="koneksi-printer"
          className="rounded-2xl border border-line bg-surface p-4"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Printer size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-ink">Koneksi printer</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Pilih kabel USB atau Bluetooth. Dua mode ini mengirim ESC/POS
                langsung ke printer sehingga struk keluar otomatis tanpa dialog.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Segmented<PrinterMode>
              value={settings.mode}
              onChange={(mode) => {
                persist({ ...settings, mode });
                setError(null);
                setNotice(null);
              }}
              options={[
                {
                  value: "serial",
                  label: "USB kabel",
                  icon: <Usb size={14} />,
                },
                {
                  value: "bluetooth",
                  label: "Bluetooth",
                  icon: <Bluetooth size={14} />,
                },
                {
                  value: "browser",
                  label: "Dialog browser",
                  icon: <Printer size={14} />,
                },
              ]}
            />
          </div>

          <div
            className={cn(
              "mt-4 grid gap-3",
              settings.mode === "serial" ? "sm:grid-cols-2" : "sm:max-w-xs",
            )}
          >
            {settings.mode === "serial" ? (
              <Field label="Baud rate" hint="Umumnya 9600 untuk printer struk">
                <Select
                  value={settings.baudRate}
                  onChange={(event) => {
                    persist({
                      ...settings,
                      baudRate: Number(event.target.value),
                    });
                    if (connected) {
                      setNotice(
                        "Baud rate disimpan. Putuskan lalu hubungkan ulang printer agar berlaku.",
                      );
                    }
                  }}
                >
                  {BAUD_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Lebar kertas">
              <Select
                value={settings.paperWidth}
                onChange={(event) =>
                  persist({
                    ...settings,
                    paperWidth: Number(event.target.value) as PaperWidth,
                  })
                }
              >
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </Select>
            </Field>
          </div>

          {settings.mode === "browser" ? (
            <div className="mt-4 rounded-xl border border-line bg-milk p-3 text-xs leading-relaxed text-ink-soft">
              <p className="font-bold text-ink">Mode dialog browser</p>
              <p className="mt-1">
                Setiap tiket membuka dialog cetak browser, jadi masih perlu
                memilih printer dan menekan cetak. Untuk cetak otomatis tanpa
                klik, pilih <strong>USB kabel</strong> atau{" "}
                <strong>Bluetooth</strong>.
              </p>
            </div>
          ) : settings.mode === "serial" ? (
            <div className="mt-4 flex flex-col gap-3">
              {!serialSupported ? (
                <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs leading-relaxed text-ink">
                  <AlertTriangle
                    size={16}
                    className="mt-0.5 shrink-0 text-warning"
                  />
                  <p>
                    Browser ini tidak mendukung Web Serial. Buka kasir di
                    Chrome/Edge desktop melalui <strong>localhost</strong> atau
                    HTTPS, lalu muat ulang halaman ini.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-milk px-3 py-2.5">
                <span
                  className={cn(
                    "flex h-2.5 w-2.5 rounded-full",
                    connection.connected ? "bg-success" : "bg-muted/40",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-ink">
                    {connection.connected ? "Terhubung" : "Belum terhubung"}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {connection.connected
                      ? portLabel(connection.portInfo)
                      : "Klik Hubungkan printer untuk memilih perangkat USB."}
                  </p>
                </div>
                {connection.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busy)}
                    onClick={() => void handleDisconnect()}
                  >
                    {busy === "disconnect" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Power size={14} />
                    )}
                    Putuskan
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      disabled={Boolean(busy) || !serialSupported}
                      onClick={() => void handleConnect()}
                    >
                      {busy === "connect" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Usb size={14} />
                      )}
                      Hubungkan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(busy) || !serialSupported}
                      onClick={() => void handleReconnect()}
                      title="Sambungkan ulang printer yang izinnya sudah tersimpan"
                    >
                      {busy === "reconnect" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Sambung ulang
                    </Button>
                  </>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-muted">
                Satu printer yang terhubung menerima semua tiket. Isi tiket
                kasir, dapur, dan bar tetap dipisah sesuai pengaturan di bawah.
                Jika printer USB tidak muncul di daftar Web Serial, printer
                mungkin memakai USB printer class; gunakan mode dialog browser.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {!bluetoothSupported ? (
                <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs leading-relaxed text-ink">
                  <AlertTriangle
                    size={16}
                    className="mt-0.5 shrink-0 text-warning"
                  />
                  <p>
                    Browser ini tidak mendukung Web Bluetooth. Gunakan
                    Chrome/Edge desktop melalui <strong>localhost</strong> atau
                    HTTPS. Web Bluetooth hanya bisa printer <strong>BLE</strong>,
                    bukan Bluetooth Classic/SPP.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-milk px-3 py-2.5">
                <span
                  className={cn(
                    "flex h-2.5 w-2.5 rounded-full",
                    bluetoothConnection.connected
                      ? "bg-success"
                      : "bg-muted/40",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-ink">
                    {bluetoothConnection.connected
                      ? "Terhubung"
                      : "Belum terhubung"}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {bluetoothConnection.connected
                      ? (bluetoothConnection.deviceName ??
                        "Printer Bluetooth BLE")
                      : "Nyalakan printer, lalu klik Hubungkan Bluetooth."}
                  </p>
                </div>
                {bluetoothConnection.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busy)}
                    onClick={() => void handleDisconnect()}
                  >
                    {busy === "disconnect" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Power size={14} />
                    )}
                    Putuskan
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      disabled={Boolean(busy) || !bluetoothSupported}
                      onClick={() => void handleConnect()}
                    >
                      {busy === "connect" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Bluetooth size={14} />
                      )}
                      Hubungkan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        Boolean(busy) ||
                        !bluetoothSupported ||
                        !bluetoothConnection.canReconnect
                      }
                      onClick={() => void handleReconnect()}
                      title="Sambungkan ulang printer Bluetooth yang izinnya sudah tersimpan"
                    >
                      {busy === "reconnect" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Sambung ulang
                    </Button>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-line bg-milk p-3 text-[11px] leading-relaxed text-muted">
                <p className="font-bold text-ink">Kalau printer tidak muncul</p>
                <p className="mt-1">
                  Pastikan printer menyala dan dalam mode pairing. Sebagian
                  printer murah memakai Bluetooth Classic (SPP) yang tidak bisa
                  diakses browser; untuk model itu gunakan kabel USB atau mode
                  dialog browser. Kalau printer SPP sudah dipasangkan di
                  komputer dan muncul sebagai port serial, pilih mode USB
                  kabel.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Settings2 size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-ink">Cetak otomatis</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Tiket dicetak saat kasir menekan tombol <strong>Terima</strong>{" "}
                pada pesanan baru.
              </p>
            </div>
          </div>

          {settings.mode === "browser" ? (
            <div className="mt-3 flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-[11px] leading-relaxed text-ink">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-warning"
              />
              <p>
                Mode dialog browser belum sepenuhnya otomatis: setiap tiket
                tetap membuka dialog cetak. Pilih USB kabel atau Bluetooth
                untuk mencetak tanpa klik.
              </p>
            </div>
          ) : !connected ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-[11px] leading-relaxed text-ink">
              <AlertTriangle size={14} className="shrink-0 text-warning" />
              <p className="min-w-0 flex-1">
                Printer belum terhubung. Cetak otomatis akan gagal sampai
                koneksi dibuat.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  document
                    .getElementById("koneksi-printer")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Hubungkan
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft p-3 text-[11px] font-semibold leading-relaxed text-success">
              <CheckCircle2 size={14} className="shrink-0" />
              <p>Printer siap. Tiket akan dikirim otomatis tanpa dialog.</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {(["cashier", "kitchen", "bar"] as PrintStation[]).map(
              (station) => {
                const Icon = STATION_ICON[station];
                const enabled = settings.autoPrint[station];
                return (
                  <div
                    key={station}
                    className="flex items-center gap-3 rounded-xl border border-line bg-milk px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-ink">
                        {STATION_LABEL[station]}
                      </p>
                      <p className="text-[11px] text-muted">
                        {station === "cashier"
                          ? "Struk pelanggan lengkap dengan harga"
                          : station === "kitchen"
                            ? "Tiket makanan tanpa harga"
                            : "Tiket minuman tanpa harga"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Cetak otomatis ${STATION_LABEL[station]}`}
                      onClick={() => updateAutoPrint(station, !enabled)}
                      className={cn(
                        "focus-ring relative h-6 w-11 shrink-0 rounded-full transition",
                        enabled ? "bg-primary" : "bg-line",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition",
                          enabled ? "left-[22px]" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                );
              },
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Jika stasiun tidak punya item pada pesanan tersebut, tiketnya
            dilewati. Pengaturan tersimpan otomatis di perangkat ini.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-ink">
              Pembagian kategori ke stasiun
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Tentukan item kategori mana yang masuk tiket dapur atau bar.
            </p>
          </div>
          <p className="text-[11px] font-semibold text-muted">
            {categoryNames.length} kategori
          </p>
        </div>

        {categoryNames.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-milk/60 px-3 py-6 text-center text-xs text-muted">
            Belum ada kategori produk dari server.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {categoryNames.map((name) => {
              const value =
                settings.categoryStations[name] ?? inferStation(name);
              return (
                <div
                  key={name}
                  className="rounded-xl border border-line bg-milk p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black text-ink">
                      {name}
                    </p>
                    <Badge tone={value === "bar" ? "info" : "default"}>
                      {value === "bar"
                        ? "Bar"
                        : value === "kitchen"
                          ? "Dapur"
                          : "Tanpa cetak"}
                    </Badge>
                  </div>
                  <Select
                    value={value}
                    onChange={(event) =>
                      updateCategoryStation(
                        name,
                        event.target.value as PrintStation | "none",
                      )
                    }
                    className="mt-2 h-9 text-xs"
                    aria-label={`Stasiun untuk kategori ${name}`}
                  >
                    {STATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-ink">Tes cetak</h2>
            <p className="mt-0.5 text-xs text-muted">
              Memakai pesanan terakhir yang ada di perangkat ini, bukan data
              contoh.
            </p>
          </div>
          {latestOrder ? (
            <p className="text-[11px] font-semibold text-muted">
              {latestOrder.code} · {formatRupiah(latestOrder.total)}
            </p>
          ) : null}
        </div>

        {!latestOrder ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-milk/60 px-3 py-6 text-center text-xs text-muted">
            Belum ada pesanan untuk dites. Buat atau terima pesanan terlebih
            dahulu.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["cashier", "kitchen", "bar"] as PrintStation[]).map(
                (station) => {
                  const Icon = STATION_ICON[station];
                  const count =
                    station === "cashier"
                      ? latestOrder.items.length
                      : station === "kitchen"
                        ? (groups?.kitchen.length ?? 0)
                        : (groups?.bar.length ?? 0);
                  return (
                    <Button
                      key={station}
                      variant="outline"
                      className="h-auto justify-start px-3 py-2.5"
                      disabled={Boolean(busy) || count === 0}
                      onClick={() => void handleTest(station)}
                    >
                      {busy === `test-${station}` ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Icon size={16} />
                      )}
                      <span className="text-left">
                        <span className="block text-xs font-black">
                          Tes {STATION_LABEL[station]}
                        </span>
                        <span className="block text-[10px] font-semibold text-muted">
                          {count} item
                        </span>
                      </span>
                    </Button>
                  );
                },
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={
                  Boolean(busy) ||
                  settings.mode === "browser" ||
                  !connected
                }
                onClick={() => void handleTestAll()}
              >
                {busy === "test-all" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Printer size={14} />
                )}
                Tes semua tiket (otomatis)
              </Button>
              <p className="text-[11px] text-muted">
                Mengikuti pengaturan Cetak otomatis di atas.
              </p>
            </div>

            {groups && groups.unassigned.length > 0 ? (
              <p className="mt-3 rounded-xl border border-line bg-milk px-3 py-2 text-[11px] text-muted">
                {groups.unassigned.length} item tidak dicetak ke dapur/bar
                karena kategorinya disetel <strong>Tidak dicetak</strong>.
              </p>
            ) : null}

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-info" />
              <p>
                Tiket dapur/bar hanya berisi item sesuai kategori di atas. Struk
                kasir selalu berisi seluruh pesanan dan harga.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
