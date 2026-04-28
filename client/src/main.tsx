import { trpc } from "@/lib/trpc-client";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { captureClientException, initClientSentry } from "./lib/sentry";

initClientSentry();

const DYNAMIC_IMPORT_RELOAD_KEY = "fg_dynamic_import_reloaded_once";

function isDynamicImportLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Failed to fetch dynamically imported module")
    || message.includes("Importing a module script failed")
    || message.includes("ChunkLoadError")
  );
}

function installDynamicImportRecovery() {
  if (typeof window === "undefined") return;

  const recover = (error: unknown) => {
    if (!isDynamicImportLoadError(error)) return;
    const alreadyReloaded = sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === "1";
    if (alreadyReloaded) return;
    sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, "1");
    window.location.reload();
  };

  window.addEventListener("error", event => recover(event.error ?? event.message));
  window.addEventListener("unhandledrejection", event => recover(event.reason));
}

installDynamicImportRecovery();

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    captureClientException(error, {
      tags: { source: "react-query", kind: "query" },
      extra: { queryHash: event.query.queryHash },
    });
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    captureClientException(error, {
      tags: { source: "react-query", kind: "mutation" },
      extra: { mutationKey: event.mutation.options.mutationKey },
    });
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
