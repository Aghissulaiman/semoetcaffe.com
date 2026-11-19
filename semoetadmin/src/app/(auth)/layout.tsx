import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-coffee-milk px-4 py-10 dark:bg-coffee-night">
      {/* Dekorasi latar */}
      <div className="pointer-events-none absolute -start-24 -top-24 h-72 w-72 rounded-full bg-coffee-brown/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-coffee-gold/10 blur-3xl" />
      <div className="relative z-1 w-full max-w-md">{children}</div>
    </div>
  );
}
