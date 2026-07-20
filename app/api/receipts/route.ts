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
          tax_rate: { type: Type.INTEGER, enum: [0, 8, 10] }
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
    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "画像を選択してください。" }, { status: 400 });
    }
    if (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "10MB以下の画像を選択してください。" }, { status: 400 });
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: image.type, data: bytes.toString("base64") } },
          { text: `日本の領収書を正確に読み取ってください。税込・税抜の表記に注意し、軽減税率マーク（※、＊など）や税率別内訳から各商品を8%・10%・不明(0)に分類してください。値引きは該当商品の金額または独立した負数明細として反映してください。読めない値を推測せず、文字列は空、数値は0、日付・時間はnullにしてください。合計金額と税額の整合性を確認してください。` }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1
      }
    });
    if (!result.text) throw new Error("画像から情報を読み取れませんでした。");
    const analysis = JSON.parse(result.text) as ReceiptAnalysis;

    const supabase = getSupabaseAdmin();
    const ext = (image.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "");
    const imagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("receipt-images")
      .upload(imagePath, bytes, { contentType: image.type, upsert: false });
    if (uploadError) throw new Error(`画像保存に失敗しました: ${uploadError.message}`);
    const { data: publicUrl } = supabase.storage.from("receipt-images").getPublicUrl(imagePath);

    const { items, ...receipt } = analysis;
    const { data: saved, error: receiptError } = await supabase
      .from("receipts")
      .insert({ ...receipt, image_url: publicUrl.publicUrl })
      .select()
      .single();
    if (receiptError) {
      await supabase.storage.from("receipt-images").remove([imagePath]);
      throw new Error(`領収書の保存に失敗しました: ${receiptError.message}`);
    }
    if (items.length) {
      const { error: itemsError } = await supabase
        .from("receipt_items")
        .insert(items.map((item) => ({ ...item, receipt_id: saved.id })));
      if (itemsError) throw new Error(`商品明細の保存に失敗しました: ${itemsError.message}`);
    }
    return NextResponse.json({ receipt: { ...saved, items } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
