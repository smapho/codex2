"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera, ChevronDown, ImageIcon, LoaderCircle, Plus, ReceiptText,
  Search, Settings2, SlidersHorizontal, Sparkles, X
} from "lucide-react";
import type { SavedReceipt } from "@/lib/types";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency", currency: "JPY", maximumFractionDigits: 0
});

type Filter = "すべて" | "8%" | "10%";

export default function ReceiptApp() {
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<Filter>("すべて");
  const [query, setQuery] = useState("");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SavedReceipt | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/receipts", {
        headers: password ? { "x-app-password": password } : {}
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReceipts(json.receipts);
      setDemo(json.demo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseImage(next: File | undefined) {
    if (!next) return;
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError("");
  }

  function closeUpload() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        body: form,
        headers: password ? { "x-app-password": password } : {}
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReceipts((current) => [json.receipt, ...current]);
      closeUpload();
      setSelected(json.receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました。");
    } finally {
      setUploading(false);
    }
  }

  const visible = receipts.filter((r) => {
    const taxMatch = filter === "すべて" ||
      (filter === "8%" ? r.tax_8_base > 0 : r.tax_10_base > 0);
    const textMatch = !query || `${r.merchant_name} ${r.items.map((i) => i.name).join(" ")}`
      .toLowerCase().includes(query.toLowerCase());
    return taxMatch && textMatch;
  });

  const monthlyTotal = receipts.reduce((sum, r) => sum + r.total_amount, 0);
  const monthlyTax = receipts.reduce((sum, r) => sum + r.total_tax_amount, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ReceiptText size={22} /></span>
          <div>
            <p>レシートポケット</p>
            <span>かんたん経費管理</span>
          </div>
        </div>
        <button className="icon-button" aria-label="設定"><Settings2 size={21} /></button>
      </header>

      <section className="content">
        {demo && (
          <div className="demo-note">
            <Sparkles size={16} />
            <span>デモ表示中 — Supabaseを接続すると撮影・保存できます</span>
          </div>
        )}
        {error && <div className="error-note">{error}</div>}

        <section className="hero">
          <div>
            <span className="eyebrow">2026年7月</span>
            <h1>今月の支出</h1>
          </div>
          <p className="total">{yen.format(monthlyTotal)}</p>
          <div className="stats">
            <span><b>{receipts.length}</b> 枚のレシート</span>
            <i />
            <span>消費税 <b>{yen.format(monthlyTax)}</b></span>
          </div>
        </section>

        <section className="actions">
          <button className="scan-button" onClick={() => fileRef.current?.click()}>
            <span><Camera size={25} /></span>
            <div><b>レシートを読み取る</b><small>撮影または写真から選択</small></div>
            <Plus size={22} />
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => chooseImage(e.target.files?.[0])}
          />
        </section>

        <section className="list-section">
          <div className="section-heading">
            <div><p>最近のレシート</p><span>{visible.length}件</span></div>
            <button><SlidersHorizontal size={16} /> 絞り込み</button>
          </div>
          <div className="search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="お店や商品を検索" />
          </div>
          <div className="chips">
            {(["すべて", "8%", "10%"] as Filter[]).map((value) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {value === "すべて" ? "すべて" : `税率 ${value}`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="empty"><LoaderCircle className="spin" /> 読み込み中</div>
          ) : visible.length === 0 ? (
            <div className="empty"><ReceiptText /> 該当するレシートはありません</div>
          ) : (
            <div className="receipt-list">
              {visible.map((receipt) => (
                <button className="receipt-card" key={receipt.id} onClick={() => setSelected(receipt)}>
                  <div className="receipt-thumb">
                    {receipt.image_url
                      ? <img src={receipt.image_url} alt="" />
                      : <ReceiptText size={25} />}
                  </div>
                  <div className="receipt-main">
                    <div className="merchant-row">
                      <b>{receipt.merchant_name || "購入先不明"}</b>
                      <strong>{yen.format(receipt.total_amount)}</strong>
                    </div>
                    <div className="receipt-meta">
                      <span>{receipt.purchase_date?.replaceAll("-", "/") || "日付不明"}</span>
                      <i>·</i>
                      <span>{receipt.purchase_time?.slice(0, 5) || "時間不明"}</span>
                      <i>·</i>
                      <span>{receipt.items.length}点</span>
                    </div>
                    <div className="tax-tags">
                      {receipt.tax_8_base > 0 && <span className="tax8">8% <b>{yen.format(receipt.tax_8_base)}</b></span>}
                      {receipt.tax_10_base > 0 && <span className="tax10">10% <b>{yen.format(receipt.tax_10_base)}</b></span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>

      <nav className="bottom-nav">
        <button className="active"><ReceiptText size={21} /><span>レシート</span></button>
        <button onClick={() => fileRef.current?.click()}><span className="nav-camera"><Camera size={24} /></span><span>読み取る</span></button>
        <button><SlidersHorizontal size={21} /><span>集計</span></button>
      </nav>

      {preview && (
        <div className="modal-backdrop">
          <section className="upload-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title">
              <div><span><ImageIcon size={20} /></span><div><b>この画像を読み取りますか？</b><small>AIが日付・商品・税率を自動で整理します</small></div></div>
              <button onClick={closeUpload}><X /></button>
            </div>
            <img className="preview" src={preview} alt="選択した領収書" />
            <label className="password-field">
              閲覧パスワード（設定している場合）
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="confirm-button" disabled={uploading} onClick={upload}>
              {uploading ? <><LoaderCircle className="spin" /> AIで解析・保存中…</> : <><Sparkles size={18} /> 読み取って保存</>}
            </button>
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section className="detail-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="detail-head">
              <div><small>{selected.purchase_date || "日付不明"} {selected.purchase_time?.slice(0,5)}</small><h2>{selected.merchant_name}</h2></div>
              <button onClick={() => setSelected(null)}><X /></button>
            </div>
            {selected.image_url && <a href={selected.image_url} target="_blank"><img className="detail-image" src={selected.image_url} alt="領収書" /></a>}
            <div className="detail-total"><span>合計</span><b>{yen.format(selected.total_amount)}</b></div>
            <div className="tax-summary">
              <div><span>8% 対象</span><b>{yen.format(selected.tax_8_base)}</b><small>消費税 {yen.format(selected.tax_8_amount)}</small></div>
              <div><span>10% 対象</span><b>{yen.format(selected.tax_10_base)}</b><small>消費税 {yen.format(selected.tax_10_amount)}</small></div>
            </div>
            <div className="items">
              <p>商品明細</p>
              {selected.items.map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <span>{item.name}<small>{item.quantity !== 1 ? ` × ${item.quantity}` : ""}</small></span>
                  <em className={item.tax_rate === 8 ? "tax8" : "tax10"}>{item.tax_rate || "?"}%</em>
                  <b>{yen.format(item.amount)}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
