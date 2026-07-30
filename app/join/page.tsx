import { Suspense } from "react";
import JoinPageClient from "./JoinPageClient";

function JoinPageFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
          Studio After Dark
        </p>

        <p className="mt-5 text-lg text-slate-400">
          Loading join page...
        </p>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinPageFallback />}>
      <JoinPageClient />
    </Suspense>
  );
}