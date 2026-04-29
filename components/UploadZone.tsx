"use client";

import { useRef, useState } from "react";

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onSelect, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onSelect(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center
        rounded-2xl border-2 border-dashed p-8 transition-all
        ${dragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 dark:border-slate-700"}
        ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/50"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="アップロード画像のプレビュー"
          className="max-h-[260px] rounded-lg object-contain"
        />
      ) : (
        <div className="text-center">
          <div className="text-5xl">🍱</div>
          <div className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">
            食事の写真をアップロード
          </div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            ドラッグ&ドロップ または クリックして選択
          </div>
          <div className="mt-2 text-xs text-slate-400 dark:text-slate-600">
            JPEG / PNG / WEBP・最大10MB
          </div>
        </div>
      )}
    </div>
  );
}
