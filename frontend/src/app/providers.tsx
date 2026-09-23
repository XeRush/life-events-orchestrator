import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SmoothScroll } from "../animations/lenis";
import { useDocumentLanguage } from "../i18n";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: false } },
  }));
  useDocumentLanguage();
  return (
    <QueryClientProvider client={client}>
      <SmoothScroll>{children}</SmoothScroll>
    </QueryClientProvider>
  );
}
