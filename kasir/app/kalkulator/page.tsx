"use client";

import { Delete, History, Maximize2, Minimize2 } from "lucide-react";
import {
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import { Button, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Logika kalkulator
// ---------------------------------------------------------------------------
type Operator = "+" | "-" | "*" | "/";

const OPERATOR_SYMBOL: Record<Operator, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

const MAX_DIGITS = 15;
const MAX_HISTORY = 30;

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  raw: string;
}

interface CalculatorState {
  display: string;
  accumulator: number | null;
  pendingOp: Operator | null;
  overwrite: boolean;
  formula: string;
  error: boolean;
  history: HistoryEntry[];
}

const INITIAL_STATE: CalculatorState = {
  display: "0",
  accumulator: null,
  pendingOp: null,
  overwrite: false,
  formula: "",
  error: false,
  history: [],
};

type CalculatorAction =
  | { type: "digit"; value: string }
  | { type: "decimal" }
  | { type: "clear" }
  | { type: "backspace" }
  | { type: "toggle-sign" }
  | { type: "percent" }
  | { type: "operator"; value: Operator }
  | { type: "equals" }
  | { type: "clear-history" }
  | { type: "reuse"; value: string };

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  // Bulatkan sisa floating point (0.1 + 0.2) tanpa memotong bilangan bulat
  // besar yang masih aman ditampilkan.
  const rounded = Number.isInteger(value)
    ? value
    : Number(value.toPrecision(12));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  if (Math.abs(normalized) >= 1e15) return normalized.toExponential(8);
  return String(normalized);
}

/** Tampilan angka gaya Indonesia: 1.234,56 */
function formatDisplay(value: string): string {
  if (value === "Error") return value;
  if (!value) return "0";
  if (/[eE]/.test(value)) return value.replace(".", ",");

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integerPart, decimalPart] = unsigned.split(".");
  const grouped = new Intl.NumberFormat("id-ID").format(
    Number(integerPart || "0"),
  );
  const formatted =
    decimalPart === undefined ? grouped : `${grouped},${decimalPart}`;
  return negative ? `-${formatted}` : formatted;
}

function parseDisplay(value: string): number {
  if (value === "Error") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyOperation(left: number, right: number, operator: Operator): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? Number.NaN : left / right;
  }
}

function historyId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resetKeepingHistory(state: CalculatorState): CalculatorState {
  return { ...INITIAL_STATE, history: state.history };
}

function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case "digit": {
      if (state.error) {
        return {
          ...resetKeepingHistory(state),
          display: action.value,
        };
      }
      if (state.overwrite) {
        return {
          ...state,
          display: action.value,
          overwrite: false,
          error: false,
        };
      }

      const digitCount = state.display.replace(/[^0-9]/g, "").length;
      if (digitCount >= MAX_DIGITS) return state;

      return {
        ...state,
        display:
          state.display === "0"
            ? action.value
            : `${state.display}${action.value}`,
        error: false,
      };
    }

    case "decimal": {
      if (state.error) {
        return {
          ...resetKeepingHistory(state),
          display: "0.",
        };
      }
      if (state.overwrite) {
        return { ...state, display: "0.", overwrite: false, error: false };
      }
      if (state.display.includes(".")) return state;
      return { ...state, display: `${state.display}.`, error: false };
    }

    case "clear":
      return resetKeepingHistory(state);

    case "backspace": {
      if (state.error) return resetKeepingHistory(state);
      if (state.overwrite) {
        return { ...state, display: "0", overwrite: false };
      }
      const next =
        state.display.length > 1 ? state.display.slice(0, -1) : "0";
      return { ...state, display: next === "-" ? "0" : next };
    }

    case "toggle-sign": {
      if (
        state.error ||
        state.display === "0" ||
        state.display === "0."
      ) {
        return state;
      }
      return {
        ...state,
        display: state.display.startsWith("-")
          ? state.display.slice(1)
          : `-${state.display}`,
      };
    }

    case "percent": {
      if (state.error) return state;
      const current = parseDisplay(state.display);
      const relativeToAccumulator =
        state.accumulator !== null &&
        (state.pendingOp === "+" || state.pendingOp === "-");
      const value = relativeToAccumulator
        ? (state.accumulator as number) * (current / 100)
        : current / 100;
      const formatted = formatNumber(value);
      return {
        ...state,
        display: formatted,
        overwrite: false,
        error: formatted === "Error",
      };
    }

    case "operator": {
      if (state.error) return state;
      const input = parseDisplay(state.display);

      if (state.pendingOp && state.accumulator !== null) {
        // Operator ditekan lagi sebelum angka kedua: cukup ganti operator.
        if (state.overwrite) {
          return {
            ...state,
            pendingOp: action.value,
            formula: `${formatDisplay(formatNumber(state.accumulator))} ${
              OPERATOR_SYMBOL[action.value]
            }`,
          };
        }

        const result = applyOperation(
          state.accumulator,
          input,
          state.pendingOp,
        );
        const formatted = formatNumber(result);
        if (formatted === "Error") {
          return {
            ...state,
            display: "Error",
            error: true,
            accumulator: null,
            pendingOp: null,
            overwrite: true,
            formula: "",
          };
        }
        return {
          ...state,
          display: formatted,
          accumulator: result,
          pendingOp: action.value,
          overwrite: true,
          formula: `${formatDisplay(formatted)} ${
            OPERATOR_SYMBOL[action.value]
          }`,
          error: false,
        };
      }

      const base = state.accumulator ?? input;
      return {
        ...state,
        accumulator: base,
        pendingOp: action.value,
        overwrite: true,
        formula: `${formatDisplay(formatNumber(base))} ${
          OPERATOR_SYMBOL[action.value]
        }`,
        error: false,
      };
    }

    case "equals": {
      if (state.error) return state;
      if (state.pendingOp === null || state.accumulator === null) {
        return { ...state, overwrite: true };
      }

      const right = parseDisplay(state.display);
      const result = applyOperation(state.accumulator, right, state.pendingOp);
      const formatted = formatNumber(result);
      const expression = `${formatDisplay(
        formatNumber(state.accumulator),
      )} ${OPERATOR_SYMBOL[state.pendingOp]} ${formatDisplay(
        formatNumber(right),
      )}`;

      if (formatted === "Error") {
        return {
          ...state,
          display: "Error",
          error: true,
          accumulator: null,
          pendingOp: null,
          overwrite: true,
          formula: "",
        };
      }

      const entry: HistoryEntry = {
        id: historyId(),
        expression,
        result: formatDisplay(formatted),
        raw: formatted,
      };

      return {
        ...state,
        display: formatted,
        accumulator: null,
        pendingOp: null,
        overwrite: true,
        formula: "",
        error: false,
        history: [entry, ...state.history].slice(0, MAX_HISTORY),
      };
    }

    case "clear-history":
      return { ...state, history: [] };

    case "reuse":
      return {
        ...INITIAL_STATE,
        history: state.history,
        display: action.value,
        overwrite: true,
      };
  }
}

// ---------------------------------------------------------------------------
// Tombol kalkulator
// ---------------------------------------------------------------------------
type KeyTone = "digit" | "utility" | "operator" | "equals";

const KEY_TONES: Record<KeyTone, string> = {
  digit: "bg-milk text-ink hover:bg-primary-soft",
  utility: "bg-primary-soft text-primary hover:bg-cream",
  operator: "bg-cream text-primary-dark hover:bg-linen",
  equals:
    "bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-dark",
};

function CalcKey({
  children,
  onClick,
  tone = "digit",
  active,
  label,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: KeyTone;
  active?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "focus-ring flex h-full min-h-12 touch-manipulation select-none items-center justify-center rounded-2xl text-xl font-black transition active:scale-[0.97] md:min-h-14 md:text-2xl",
        KEY_TONES[tone],
        active && "bg-primary text-white shadow-sm shadow-primary/20",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------
export default function KalkulatorPage() {
  const [state, dispatch] = useReducer(calculatorReducer, INITIAL_STATE);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Sebagian browser tablet tidak mengizinkan fullscreen API.
    }
  };

  // Dukungan keyboard, diabaikan saat fokus ada di input/modal lain.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        dispatch({ type: "digit", value: key });
        return;
      }

      if (key === "." || key === ",") {
        event.preventDefault();
        dispatch({ type: "decimal" });
        return;
      }

      const operators: Record<string, Operator> = {
        "+": "+",
        "-": "-",
        "*": "*",
        x: "*",
        X: "*",
        "/": "/",
      };
      if (operators[key]) {
        event.preventDefault();
        dispatch({ type: "operator", value: operators[key] });
        return;
      }

      if (key === "Enter" || key === "=") {
        event.preventDefault();
        dispatch({ type: "equals" });
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "backspace" });
        return;
      }
      if (key === "Escape" || key === "Delete") {
        event.preventDefault();
        dispatch({ type: "clear" });
        return;
      }
      if (key === "%") {
        event.preventDefault();
        dispatch({ type: "percent" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const display = formatDisplay(state.display);
  const expression = state.formula
    ? state.overwrite
      ? state.formula
      : `${state.formula} ${formatDisplay(state.display)}`
    : "Siap menghitung";
  // Angka panjang tetap muat di layar tablet tanpa terpotong.
  const displayTextSize =
    display.length > 14
      ? "text-3xl md:text-4xl"
      : display.length > 9
        ? "text-4xl md:text-5xl"
        : "text-5xl md:text-6xl";

  return (
    <div className="flex h-[calc(100dvh-11.75rem)] min-h-0 flex-col gap-4 lg:h-[calc(100dvh-4.25rem)]">
      <div className="shrink-0">
        <PageHeader
          title="Kalkulator"
          description="Hitung cepat tanpa meninggalkan kasir. Bisa juga pakai keyboard."
          actions={
            <Button
              variant="outline"
              onClick={() => void toggleFullscreen()}
              aria-label={
                isFullscreen ? "Keluar layar penuh" : "Masuk layar penuh"
              }
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
            </Button>
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 min-w-0 flex-col rounded-[24px] border border-line bg-surface p-3 shadow-[0_1px_0_rgba(42,26,17,0.04)] md:p-4">
          <div className="flex min-h-[112px] flex-col justify-between rounded-[20px] bg-espresso px-4 py-4 text-right text-cream md:min-h-[136px] md:px-6 md:py-5">
            <p className="truncate text-[11px] font-semibold text-cream/60 md:text-xs">
              {expression}
            </p>
            <p
              className={cn(
                "truncate font-black tracking-tight tabular",
                displayTextSize,
                state.error ? "text-danger-soft" : "text-cream",
              )}
              aria-live="polite"
            >
              {display}
            </p>
          </div>

          <div className="mt-3 grid min-h-0 flex-1 grid-cols-4 grid-rows-5 gap-2 md:mt-4 md:gap-2.5">
            <CalcKey
              tone="utility"
              onClick={() => dispatch({ type: "clear" })}
              label="Hapus semua"
            >
              AC
            </CalcKey>
            <CalcKey
              tone="utility"
              onClick={() => dispatch({ type: "backspace" })}
              label="Hapus satu digit"
            >
              <Delete size={20} />
            </CalcKey>
            <CalcKey
              tone="utility"
              onClick={() => dispatch({ type: "percent" })}
              label="Persen"
            >
              %
            </CalcKey>
            <CalcKey
              tone="operator"
              active={state.pendingOp === "/"}
              onClick={() => dispatch({ type: "operator", value: "/" })}
              label="Bagi"
            >
              ÷
            </CalcKey>

            {["7", "8", "9"].map((digit) => (
              <CalcKey
                key={digit}
                onClick={() => dispatch({ type: "digit", value: digit })}
              >
                {digit}
              </CalcKey>
            ))}
            <CalcKey
              tone="operator"
              active={state.pendingOp === "*"}
              onClick={() => dispatch({ type: "operator", value: "*" })}
              label="Kali"
            >
              ×
            </CalcKey>

            {["4", "5", "6"].map((digit) => (
              <CalcKey
                key={digit}
                onClick={() => dispatch({ type: "digit", value: digit })}
              >
                {digit}
              </CalcKey>
            ))}
            <CalcKey
              tone="operator"
              active={state.pendingOp === "-"}
              onClick={() => dispatch({ type: "operator", value: "-" })}
              label="Kurang"
            >
              −
            </CalcKey>

            {["1", "2", "3"].map((digit) => (
              <CalcKey
                key={digit}
                onClick={() => dispatch({ type: "digit", value: digit })}
              >
                {digit}
              </CalcKey>
            ))}
            <CalcKey
              tone="operator"
              active={state.pendingOp === "+"}
              onClick={() => dispatch({ type: "operator", value: "+" })}
              label="Tambah"
            >
              +
            </CalcKey>

            <CalcKey
              tone="utility"
              onClick={() => dispatch({ type: "toggle-sign" })}
              label="Ubah tanda"
            >
              ±
            </CalcKey>
            <CalcKey onClick={() => dispatch({ type: "digit", value: "0" })}>
              0
            </CalcKey>
            <CalcKey
              onClick={() => dispatch({ type: "decimal" })}
              label="Koma desimal"
            >
              ,
            </CalcKey>
            <CalcKey
              tone="equals"
              onClick={() => dispatch({ type: "equals" })}
              label="Sama dengan"
            >
              =
            </CalcKey>
          </div>

          <p className="mt-2 hidden text-[10px] leading-relaxed text-muted sm:block">
            Keyboard: angka 0–9, + − × ÷, Enter untuk hasil, Backspace untuk
            hapus, Esc untuk reset.
          </p>
        </section>

        <aside className="hidden min-h-0 flex-col rounded-[24px] border border-line bg-surface p-4 lg:flex">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-ink">Riwayat</p>
              <p className="text-[11px] text-muted">
                Klik hasil untuk memakai ulang angkanya.
              </p>
            </div>
            {state.history.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: "clear-history" })}
              >
                Hapus
              </Button>
            ) : null}
          </div>

          <div className="thin-scroll mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {state.history.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <EmptyState
                  icon={<History size={20} />}
                  title="Belum ada riwayat"
                  description="Hasil perhitungan akan muncul di sini."
                />
              </div>
            ) : (
              state.history.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() =>
                    dispatch({ type: "reuse", value: entry.raw })
                  }
                  className="focus-ring w-full rounded-xl border border-line bg-milk/70 px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-primary-soft"
                >
                  <p className="truncate text-[11px] font-semibold text-muted">
                    {entry.expression} =
                  </p>
                  <p className="truncate text-lg font-black text-ink tabular">
                    {entry.result}
                  </p>
                </button>
              ))
            )}
          </div>

          <p className="mt-3 shrink-0 border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
            Alat bantu hitung saja — tidak mengubah data pesanan atau
            pembayaran.
          </p>
        </aside>
      </div>
    </div>
  );
}
