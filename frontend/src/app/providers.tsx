import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SmoothScroll } from "../animations/lenis";
import { FetchBar } from "../animations/motion";
import { ApiError } from "../api/client";
import { useDocumentLanguage } from "../i18n";
import { useThemeEffect } from "./theme";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 3000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  }));
  useDocumentLanguage();
  useThemeEffect();
  return (
    <QueryClientProvider client={client}>
      <FetchBar />
      <SmoothScroll>{children}</SmoothScroll>
    </QueryClientProvider>
  );
}
