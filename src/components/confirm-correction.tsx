"use client";

export function ConfirmCorrection({
  candidateLabel,
  onCancel,
  onConfirm,
}: {
  candidateLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="correction-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="correction-title" className="text-xl font-black">Konfirmasi koreksi</h2>
        <p className="mt-3 text-lg">Kurangi 1 suara {candidateLabel}?</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button autoFocus onClick={onCancel} className="h-14 rounded-xl border-2 border-neutral-300 font-black">Batal</button>
          <button onClick={onConfirm} className="h-14 rounded-xl bg-[var(--red)] font-black text-white">Ya, koreksi</button>
        </div>
      </div>
    </div>
  );
}
