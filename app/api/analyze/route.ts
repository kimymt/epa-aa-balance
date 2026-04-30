import { NextResponse } from "next/server";
import { analyzePhoto, VisionError } from "@/lib/vision";
import { calculate } from "@/lib/eaa-calculator";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が不正です。" },
      { status: 400 },
    );
  }

  const file = formData.get("photo");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "写真がアップロードされていません。" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ファイルサイズが10MBを超えています。" },
      { status: 400 },
    );
  }

  const mime = file.type;
  if (!ALLOWED_MIMES.includes(mime)) {
    if (mime === "image/heic" || mime === "image/heif") {
      return NextResponse.json(
        {
          error:
            "iPhoneのHEIC形式はサポートしていません。設定で「最も互換性のある形式」を選択してください。",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "対応していない画像形式です。JPEG/PNG/WEBPで再アップロードしてください。" },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();

  let foods;
  try {
    foods = await analyzePhoto(bytes, mime);
  } catch (err) {
    if (err instanceof VisionError) {
      return NextResponse.json({ error: err.userMessage }, { status: 502 });
    }
    return NextResponse.json(
      { error: "解析に失敗しました。30秒後に再試行してください。" },
      { status: 502 },
    );
  }

  if (foods.length === 0) {
    return NextResponse.json(
      {
        error:
          "食材を認識できませんでした。明るい場所で撮影し直してください。",
      },
      { status: 422 },
    );
  }

  const result = calculate(foods);
  return NextResponse.json({ ok: true, result });
}
