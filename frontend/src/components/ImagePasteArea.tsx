"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";

type ImagePasteAreaProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process image");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function ImagePasteArea({ value, onChange }: ImagePasteAreaProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function acceptFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) {
      setLocalError("Paste or drop an image file");
      return;
    }

    setBusy(true);
    setLocalError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl.length > 3_500_000) {
        setLocalError("Image is too large. Try a smaller screenshot.");
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to read image");
    } finally {
      setBusy(false);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        void acceptFile(item.getAsFile());
        return;
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    void acceptFile(file);
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
      <span className="font-medium">Image</span>
      <div
        ref={boxRef}
        role="button"
        tabIndex={0}
        onClick={() => boxRef.current?.focus()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPaste={onPaste}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className={`min-h-[9rem] rounded-xl border border-dashed px-3 py-3 outline-none transition ${
          focused
            ? "border-sky-400 bg-sky-50/60 ring-2 ring-sky-200 dark:border-sky-500 dark:bg-sky-950/50 dark:ring-sky-800"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/80 dark:hover:border-slate-500"
        }`}
      >
        {value ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg bg-slate-900/90 p-2 dark:bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt="Pasted bid"
                className="max-h-48 w-full rounded-md object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click here and paste again to replace
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(null);
                  setLocalError(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[7rem] flex-col items-center justify-center gap-1 text-center">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {busy ? "Processing image…" : "Click here, then paste an image"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ctrl/Cmd+V after copying a screenshot, or drop an image file
            </p>
          </div>
        )}
      </div>
      {localError && (
        <p className="text-xs text-red-600 dark:text-red-400">{localError}</p>
      )}
    </div>
  );
}
