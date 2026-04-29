"use client";

import { useRef, useState } from "react";

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

const HEIC_MIMES = ["image/heic", "image/heif"];
const HEIC_EXT_RE = /\.(heic|heif)$/i;

function isHeic(file: File): boolean {
  return HEIC_MIMES.includes(file.type) || HEIC_EXT_RE.test(file.name);
}

export function UploadZone({ onSelect, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setConvertError(null);

    let processed = file;

    if (isHeic(file)) {
      setConverting(true);
      try {
        // heic2any は SSR で window を参照するため動的import
        const { default: heic2any } = await import("heic2any");
        const blob = (await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        })) as Blob;
        const newName = file.name.replace(HEIC_EXT_RE, ".jpg");
        processed = new File([blob], newName, { type: "image/jpeg" });
      } catch (err) {
        setConverting(false);
        const msg = err instanceof Error ? err.message : "変換失敗";
        setConvertError(`HEIC変換に失敗しました: ${msg}`);
        return;
      }
      setConverting(false);
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(processed));
    onSelect(processed);
  }

  const isDisabled = disabled || converting;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (isDisabled) return;
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        onClick={() => !isDisabled && inputRef.current?.click()}
        className={`
          relative flex min-h-[240px] sm:min-h-[280px] cursor-pointer flex-col items-center justify-center
          rounded-2xl border-2 border-dashed p-4 sm:p-8 transition-all
          ${dragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 dark:border-slate-700"}
          ${isDisabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/50"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="hidden"
          disabled={isDisabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="アップロード画像のプレビュー"
            className="max-h-[40vh] sm:max-h-[320px] max-w-full rounded-lg object-contain"
          />
        ) : converting ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
            <div className="text-sm text-slate-600 dark:text-slate-400">
              HEIC画像を変換中...
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-5xl">🍱</div>
            <div className="mt-4 text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300">
              食事の写真をアップロード
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              タップして選択<span className="hidden sm:inline">、またはドラッグ&ドロップ</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 dark:text-slate-600">
              JPEG / PNG / WEBP / HEIC・最大10MB
            </div>
          </div>
        )}
      </div>
      {convertError && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {convertError}
        </div>
      )}
    </div>
  );
}
