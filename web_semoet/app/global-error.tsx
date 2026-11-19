"use client";

/**
 * Fallback terakhir bila root layout sendiri gagal dirender.
 * Berkas ini menggantikan root layout, jadi wajib menyertakan <html>/<body>
 * dan tidak bisa mengandalkan kelas Tailwind global.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Terjadi kesalahan tak terduga.";

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#2a1a11",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "24px",
        }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              borderRadius: "9999px",
              background: "#f7e4e0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}>
            !
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>Ups, ada masalah</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#8a7565" }}>{message}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              border: 0,
              borderRadius: "9999px",
              background: "#6f4e37",
              color: "#ffffff",
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}>
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
