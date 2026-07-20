import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { demoReceipts } from "@/lib/demo";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type { ReceiptAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    purchase_date: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD" },
    purchase_time: { type: Type.STRING, nullable: true, description: "HH:mm" },
    merchant_name: { type: Type.STRING },
    total_amount: { type: Type.NUMBER },
    subtotal_amount: { type: Type.NUMBER, nullable: true },
    tax_8_base: { type: Type.NUMBER },
    tax_8_amount: { type: Type.NUMBER },
    tax_10_base: { type: Type.NUMBER },
    tax_10_amount: { type: Type.NUMBER },
    total_tax_amount: { type: Type.NUMBER },
    currency: { type: Type.STRING, enum: ["JPY"] },
    notes: { type: Type.STRING, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.NUMBER, nullable: true },
          amount: { type: Type.NUMBER },
          tax_rate: {
            type: Type.INTEGER,
            description: "適用税率。軽減税率は8、標準税率は10、不明は0"
          }
        },
        required: ["name", "quantity", "unit_price", "amount", "tax_rate"]
      }
    }
  },
  required: [
    "purchase_date", "purchase_time", "merchant_name", "total_amount",
    "subtotal_amount", "tax_8_base", "tax_8_amount", "tax_10_base",
    "tax_10_amount", "total_tax_amount", "currency", "notes", "items"
  ]
};

function unauthorized(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  return Boolean(password && request.headers.get("x-app-password") !== password);
}

export async function GET(request: NextRequest) {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
  }
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ receipts: demoReceipts, demo: true });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("receipts")
    .select("*, items:receipt_items(*)")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ receipts: data, demo: false });
}

export async function POST(request: NextRequest) {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
  }
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ error: "Google AI APIキーが未設定です。" }, { status: 503 });
    }
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Supabaseが未接続です。READMEの手順で設定してください。" }, { status: 503 });
    }

    const form = await request.formData();
    const images = [...form.getAll("images"), form.get("image")]
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, 2);
    if (!images.length) {
      return NextResponse.json({ error: "画像を選択してください。" }, { status: 400 });
    }
    if (images.some((image) => !image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)) {
      return NextResponse.json({ error: "1枚10MB以下の画像を選択してください。" }, { status: 400 });
    }

    const imageData = await Promise.all(images.map(async (image) => ({
      file: image,
      bytes: Buffer.from(await image.arrayBuffer())
    })));
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      contents: [{
        role: "user",
        parts: [
          ...imageData.map(({ file, bytes }) => ({
            inlineData: { mimeType: file.type, data: bytes.toString("base64") }
          })),
          { text: `日本の領収書を正確に読み取ってください。画像が2枚ある場合は、同じ長い領収書の上半分・下半分として重複行を除き、1件の領収書に統合してください。税込・税抜の表記に注意し、軽減税率マーク（※、＊など）や税率別内訳から各商品を8%・10%・不明(0)に分類してください。値引きは該当商品の金額または独立した負数明細として反映してください。読めない値を推測せず、文字列は空、数値は0、日付・時間はnullにしてください。合計金額と税額の整合性を確認してください。` }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1
      }
    });
    if (!result.text) throw new Error("画像から情報を読み取れませんでした。");
    const parsed = JSON.parse(result.text) as ReceiptAnalysis;
    const analysis: ReceiptAnalysis = {
      ...parsed,
      items: (parsed.items ?? []).map((item) => ({
        ...item,
        tax_rate: item.tax_rate === 8 ? 8 : item.tax_rate === 10 ? 10 : 0
      }))
    };

    const supabase = getSupabaseAdmin();
    const uploadedPaths: string[] = [];
    const imageUrls: string[] = [];
    for (const { file, bytes } of imageData) {
      const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "");
      const imagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("receipt-images")
        .upload(imagePath, bytes, { contentType: file.type, upsert: false });
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from("receipt-images").remove(uploadedPaths);
        throw new Error(`画像保存に失敗しました: ${uploadError.message}`);
      }
      uploadedPaths.push(imagePath);
      imageUrls.push(supabase.storage.from("receipt-images").getPublicUrl(imagePath).data.publicUrl);
    }

    const { items, ...receipt } = analysis;
    const { data: saved, error: receiptError } = await supabase
      .from("receipts")
      .insert({ ...receipt, image_url: imageUrls[0], image_urls: imageUrls })
      .select()
      .single();
    if (receiptError) {
      await supabase.storage.from("receipt-images").remove(uploadedPaths);
      throw new Error(`領収書の保存に失敗しました: ${receiptError.message}`);
    }
    if (items.length) {
      const { error: itemsError } = await supabase
        .from("receipt_items")
        .insert(items.map((item) => ({ ...item, receipt_id: saved.id })));
      if (itemsError) {
        await supabase.from("receipts").delete().eq("id", saved.id);
        await supabase.storage.from("receipt-images").remove(uploadedPaths);
        throw new Error(`商品明細の保存に失敗しました: ${itemsError.message}`);
      }
    }
    return NextResponse.json({ receipt: { ...saved, items } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
  }
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabaseが未接続です。" }, { status: 503 });
  }
  try {
    const { id } = await request.json() as { id?: string };
    if (!id) return NextResponse.json({ error: "領収書IDが必要です。" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: receipt, error: findError } = await supabase
      .from("receipts")
      .select("image_url, image_urls")
      .eq("id", id)
      .single();
    if (findError) return NextResponse.json({ error: "領収書が見つかりません。" }, { status: 404 });

    const urls = receipt.image_urls?.length ? receipt.image_urls : [receipt.image_url];
    const marker = "/storage/v1/object/public/receipt-images/";
    const paths = urls
      .map((url: string) => url.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : "")
      .filter(Boolean);
    const { error: deleteError } = await supabase.from("receipts").delete().eq("id", id);
    if (deleteError) throw new Error(deleteError.message);
    if (paths.length) await supabase.storage.from("receipt-images").remove(paths);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "削除に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
