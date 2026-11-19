import { formatRupiah } from "./format";
import type { Order } from "./types";

type AudioContextConstructor = typeof AudioContext;

let audioContext: AudioContext | null = null;
let notificationAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) {
    if (audioContext.state !== "closed") return audioContext;
    audioContext = null;
  }

  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;
  if (!ctor) return null;

  audioContext = new ctor();
  return audioContext;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

/**
 * Buat file WAV pendek berisi beberapa nada notifikasi. Dipakai lewat
 * HTMLAudioElement supaya tetap bisa berbunyi saat tab kasir di background.
 */
function createBeepWavUrl(): string {
  const sampleRate = 22_050;
  const notes = [
    { frequency: 880, duration: 0.2 },
    { frequency: 1175, duration: 0.2 },
    { frequency: 880, duration: 0.2 },
    { frequency: 1397, duration: 0.24 },
  ];
  const gap = 0.06;
  const totalDuration = notes.reduce(
    (sum, note) => sum + note.duration + gap,
    0,
  );
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, totalSamples * 2, true);

  let sampleIndex = 0;
  for (const note of notes) {
    const noteSamples = Math.floor(sampleRate * note.duration);
    const attackSamples = Math.max(1, Math.floor(sampleRate * 0.01));
    const releaseSamples = Math.max(1, Math.floor(sampleRate * 0.04));

    for (let i = 0; i < noteSamples; i += 1) {
      const time = i / sampleRate;
      const attack = Math.min(1, i / attackSamples);
      const release = Math.min(
        1,
        (noteSamples - 1 - i) / releaseSamples,
      );
      const envelope = Math.max(0, Math.min(attack, release));
      const sample =
        Math.sin(2 * Math.PI * note.frequency * time) * 0.8 * envelope;

      view.setInt16(
        44 + sampleIndex * 2,
        Math.round(sample * 32_767),
        true,
      );
      sampleIndex += 1;
    }

    // Buffer sudah nol, jadi bagian jeda otomatis berupa hening.
    sampleIndex += Math.floor(sampleRate * gap);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function getNotificationAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (notificationAudio) return notificationAudio;

  try {
    const audio = new Audio(createBeepWavUrl());
    audio.preload = "auto";
    audio.volume = 1;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    // Sebagian browser mobile lebih konsisten memutar audio yang berada
    // di dalam DOM.
    document.body.appendChild(audio);
    notificationAudio = audio;
    return audio;
  } catch {
    return null;
  }
}

/**
 * Harus dipanggil dari gesture pengguna (klik / tombol keyboard) supaya
 * browser mengizinkan audio diputar nanti saat pesanan masuk.
 */
export async function unlockNotificationAudio(): Promise<void> {
  // Unlock HTMLAudioElement lebih dulu dan tetap sinkron di dalam gesture
  // pengguna. Jangan taruh setelah await, karena user activation bisa hilang.
  const audio = getNotificationAudio();
  if (audio) {
    try {
      // Jangan biarkan kegagalan seek mencegah proses unlock.
      try {
        audio.currentTime = 0;
      } catch {
        // Abaikan; audio bisa tetap diputar dari posisi awal.
      }
      // Volume sangat kecil supaya proses unlock tidak terdengar. Jangan
      // di-pause setelah play() karena promise-nya bisa selesai bersamaan
      // dengan bunyi notifikasi yang baru masuk.
      audio.volume = 0.001;
      void audio.play().catch(() => {
        audio.volume = 1;
      });
    } catch {
      audio.volume = 1;
    }
  }

  const context = getAudioContext();
  if (context) {
    // Putar buffer hening singkat secara sinkron di dalam gesture pengguna.
    try {
      const buffer = context.createBuffer(1, 1, 22_050);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
    } catch {
      // Abaikan; jalur audio utama memakai HTMLAudioElement.
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Browser tetap memblokir Web Audio; audio element tetap dicoba.
      }
    }
  }
}

/** Fallback kalau HTMLAudioElement gagal diputar. */
async function playWebAudioBeep(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }
  if (context.state !== "running") return;

  try {
    const start = context.currentTime + 0.02;
    const notes = [
      { offset: 0, frequency: 880, duration: 0.2 },
      { offset: 0.26, frequency: 1175, duration: 0.2 },
      { offset: 0.52, frequency: 880, duration: 0.2 },
      { offset: 0.78, frequency: 1397, duration: 0.24 },
    ];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + note.offset;
      const noteEnd = noteStart + note.duration;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.8, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  } catch {
    // Audio gagal diputar; notifikasi visual tetap tampil.
  }
}

/**
 * Bunyi notifikasi pesanan baru. HTMLAudioElement dipakai lebih dulu karena
 * lebih andal saat tab kasir sedang tidak aktif.
 */
export async function playNewOrderSound(): Promise<void> {
  const audio = getNotificationAudio();
  if (audio) {
    try {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Abaikan; play() tetap dicoba.
      }
      audio.volume = 1;
      await audio.play();
      return;
    } catch {
      // Lanjut ke fallback Web Audio.
    }
  }

  await playWebAudioBeep();
}

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission !== "default") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Notifikasi desktop saat tab/window kasir sedang tidak aktif. */
export function showOrderNotification(
  order: Order,
  onClick: () => void,
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Jangan dobel saat kasir sedang aktif melihat aplikasi; toast + suara
  // sudah cukup. Notifikasi desktop dipakai saat tab/window tidak fokus.
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const notification = new Notification("Pesanan baru masuk!", {
      body: `${order.code} · ${order.customerName || "Walk-in"} · ${formatRupiah(
        order.total,
      )}`,
      icon: "/favicon.ico",
      tag: `semoet-order-${order.id}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // Notifikasi browser opsional; toast + suara tetap berjalan.
  }
}
