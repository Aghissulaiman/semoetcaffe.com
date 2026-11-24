"use client";

import { useEffect, useRef } from "react";

/** Suara notifikasi order baru.
 *  Pastikan file notiforder.wav ada di public/kasir/notifi/notiforder.wav */
export function useOrderNotification() {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    audioRef.current = new Audio("/kasir/public/notifi/notiforder.wav");
    // Tunggu file siap diputar sebelum enabling play()
    audioRef.current.oncanplaythrough = () => {
      // Suara siap diputar
    };
    // Reset currentTime setiap effect run
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const play = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => {
        // Browser mungkin memblokir otomatis pemutaran suara
        console.log("Gagal memutar notifikasi:", e);
      });
    }
  };

  return { play };
}
