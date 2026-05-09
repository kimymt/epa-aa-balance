"use client";

import { useRef, useState } from "react";
import { MEAL_TYPES } from "@/lib/session";

interface Props {
  files: File[];
  mealTypes: (string | null)[];
  onFilesChange: (files: File[]) => void;
  onMealTypesChange: (mealTypes: (string | null)[]) => void;
  disabled?: boolean;
}

const HEIC_MIMES = ["image/heic", "image/heif"];
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const MAX_IMAGES = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const TARGET_SIZE = 500 * 1024; // 500 KB target for compression

function isHeic(file: File): boolean {
  return HEIC_MIMES.includes(file.type) || HEIC_EXT_RE.test(file.name);
}

export function UploadZone({
  files,
  mealTypes,
  onFilesChange,
  onMealTypesChange,
  disabled,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Map<number, string>>(new Map());

  async function processFile(file: File): Promise<File> {
    let processed = file;

    // Convert HEIC if needed
    if (isHeic(file)) {
      try {
        const { default: heic2any } = await import("heic2any");
        const blob = (await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        })) as Blob;
        const newName = file.name.replace(HEIC_EXT_RE, ".jpg");
        processed = new File([blob], newName, { type: "image/jpeg" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "変換失敗";
        throw new Error(`HEIC変換に失敗しました: ${msg}`);
      }
    }

    // Compress image
    try {
      const imageCompression = await import(
        "browser-image-compression"
      ).then((m) => m.default);
      const compressed = await imageCompression(processed, {
        maxSizeMB: TARGET_SIZE / (1024 * 1024),
        maxWidthOrHeight: 2000,
        useWebWorker: true,
      });
      processed = new File([compressed], processed.name, {
        type: processed.type,
      });
    } catch (err) {
      console.warn("圧縮失敗、元ファイルを使用", err);
    }

    return processed;
  }

  async function handleFiles(newFiles: File[]) {
    setError(null);

    if (files.length + newFiles.length > MAX_IMAGES) {
      setError(
        `最大${MAX_IMAGES}枚までアップロードできます。現在${files.length}枚、追加${newFiles.length}枚です。`
      );
      return;
    }

    setProcessing(true);
    const processedFiles: File[] = [];
    const newMealTypes: (string | null)[] = [];

    for (const file of newFiles) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`ファイル「${file.name}」が10MBを超えています。`);
        setProcessing(false);
        return;
      }

      try {
        const processed = await processFile(file);
        processedFiles.push(processed);
        newMealTypes.push("breakfast"); // Default meal type
      } catch (err) {
        const msg = err instanceof Error ? err.message : "処理失敗";
        setError(msg);
        setProcessing(false);
        return;
      }
    }

    // Update files and meal types
    const updatedFiles = [...files, ...processedFiles];
    const updatedMealTypes = [...mealTypes, ...newMealTypes];

    onFilesChange(updatedFiles);
    onMealTypesChange(updatedMealTypes);

    // Create previews
    const newPreviews = new Map(previews);
    processedFiles.forEach((file, idx) => {
      const key = files.length + idx;
      newPreviews.set(key, URL.createObjectURL(file));
    });
    setPreviews(newPreviews);

    setProcessing(false);
  }

  function removeFile(index: number) {
    const newFiles = files.filter((_, i) => i !== index);
    const newMealTypes = mealTypes.filter((_, i) => i !== index);

    onFilesChange(newFiles);
    onMealTypesChange(newMealTypes);

    // Clean up preview
    const preview = previews.get(index);
    if (preview) URL.revokeObjectURL(preview);
    const newPreviews = new Map(previews);
    newPreviews.delete(index);
    setPreviews(newPreviews);
  }

  function updateMealType(index: number, mealType: string) {
    const newMealTypes = [...mealTypes];
    newMealTypes[index] = mealType;
    onMealTypesChange(newMealTypes);
  }

  const isDisabled = disabled || processing;
  const canAddMore = files.length < MAX_IMAGES;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {canAddMore && (
        <button
          type="button"
          aria-label={
            files.length > 0
              ? `さらに食事の写真を追加 (現在 ${files.length} 枚、最大 ${MAX_IMAGES - files.length} 枚まで追加可能)`
              : "食事の写真をアップロード"
          }
          aria-busy={processing || undefined}
          disabled={isDisabled}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDisabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (isDisabled) return;
            const newFiles = Array.from(e.dataTransfer.files);
            void handleFiles(newFiles);
          }}
          onClick={() => !isDisabled && inputRef.current?.click()}
          className={`
            relative flex w-full min-h-[200px] sm:min-h-[240px] cursor-pointer flex-col items-center justify-center
            rounded-2xl border-2 border-dashed p-4 sm:p-8 transition-all
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
            ${dragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 dark:border-slate-700"}
            ${isDisabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/50"}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            disabled={isDisabled}
            onChange={(e) => {
              const newFiles = Array.from(e.target.files || []);
              void handleFiles(newFiles);
            }}
          />
          {processing ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
              <div className="text-sm text-slate-600 dark:text-slate-400">
                画像を処理中...
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl sm:text-5xl">🍱</div>
              <div className="mt-3 sm:mt-4 text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300">
                {files.length > 0 ? "さらに追加" : "食事の写真をアップロード"}
              </div>
              <div className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-500">
                タップして選択
                <span className="hidden sm:inline">、またはドラッグ&ドロップ</span>
              </div>
              <div className="mt-2 text-xs text-slate-400 dark:text-slate-600">
                {files.length}/
                {MAX_IMAGES} 枚
                {files.length < MAX_IMAGES && ` (最大 ${MAX_IMAGES - files.length} 枚まで)`}
              </div>
            </div>
          )}
        </button>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {files.length} 枚選択
          </div>
          {files.map((file, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3"
            >
              <div className="flex gap-3 items-start">
                {previews.get(index) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews.get(index)!}
                    alt={`プレビュー ${index + 1}`}
                    className="w-16 h-16 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 break-all">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex-shrink-0"
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>

              {/* Meal Type Selector */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  食事タイプ
                </div>
                <div className="flex gap-2">
                  {MEAL_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => updateMealType(index, type.value)}
                      className={`
                        flex-1 py-2 px-3 rounded-lg text-sm font-medium transition
                        ${
                          mealTypes[index] === type.value
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }
                      `}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}
