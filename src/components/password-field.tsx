"use client";

import { useId, useState } from "react";

export function PasswordField({ label, autoFocus = false }: { label: string; autoFocus?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label>
      <span className="relative block">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          autoFocus={autoFocus}
          className="h-14 w-full rounded-xl border-2 border-neutral-300 bg-white px-4 pr-14 text-lg text-black"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          aria-pressed={visible}
          className="absolute right-1 top-1 grid h-12 w-12 touch-manipulation place-items-center rounded-lg text-neutral-700 active:bg-neutral-100"
        >
          {visible ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M9.9 4.2A10.5 10.5 0 0112 4c5.5 0 9 8 9 8a18.7 18.7 0 01-2.1 3.2" />
              <path d="M6.6 6.6C4.2 8.2 3 12 3 12s3.5 8 9 8a9.8 9.8 0 004.1-.9" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
    </div>
  );
}
