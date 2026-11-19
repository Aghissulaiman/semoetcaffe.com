import { Suspense } from "react";

import { Loader } from "@/components/ui/loader";

import MenuScreen from "./menu-screen";

export default function MenuPage() {
  return (
    <Suspense fallback={<Loader label="Memuat menu…" />}>
      <MenuScreen />
    </Suspense>
  );
}
