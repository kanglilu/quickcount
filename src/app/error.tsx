"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-dvh items-center justify-center p-4"><div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg"><h1 className="text-2xl font-black">Data belum bisa dimuat</h1><p className="mt-3 text-neutral-600">{error.message}</p><button onClick={reset} className="mt-6 h-12 w-full rounded-xl border-2 border-black bg-white font-black text-black shadow-[0_4px_0_#101010]">Coba lagi</button></div></main>;
}
