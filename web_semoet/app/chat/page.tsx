import { Suspense } from "react";

import { Loader } from "@/components/ui/loader";

import ChatScreen from "./chat-screen";

export default function ChatPage() {
  return (
    <Suspense fallback={<Loader label="Memuat chat…" />}>
      <ChatScreen />
    </Suspense>
  );
}
