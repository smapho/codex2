"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera, ChevronLeft, ChevronRight, ImageIcon, LoaderCircle, Plus, ReceiptText,
  Search, Settings2, SlidersHorizontal, Sparkles, Trash2, X
} from "lucide-react";
import type { SavedReceipt } from "@/lib/types";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency", currency: "JPY", maximumFractionDigits: 0
});

type Filter = "すべて" | "8%" | "10%";
type Tab = "expenses" | "scanned" | "history";

export default function ReceiptApp() {
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<Filter>("すべて");
  const [activeTab, setActiveTab] = useState<Tab>("expenses");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [query, setQuery] = useState("");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SavedReceipt | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLElement>(null);

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

  async function optimizeImage(source: File): Promise<File> {
    if (!source.type.startsWith("image/")) return source;
    const sourceUrl = URL.createObjectURL(source);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = sourceUrl;
      });
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) return source;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.84)
      );
      if (!blob || blob.size >= source.size) return source;
      return new File([blob], "receipt.jpg", { type: "image/jpeg" });
    } catch {
      return source;
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  async function chooseImage(next: File | undefined) {
    if (!next) return;
    if (files.length >= 2) return;
    const optimized = await optimizeImage(next);
    setFiles((current) => [...current, optimized].slice(0, 2));
    setPreviews((current) => [...current, URL.createObjectURL(optimized)].slice(0, 2));
    setError("");
  }

  function closeUpload() {
    previews.forEach((preview) => URL.revokeObjectURL(preview));
    setFiles([]);
    setPreviews([]);
  }

  async function upload() {
    if (!files.length) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    files.forEach((file) => form.append("images", file));
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

  function filterReceipts(source: SavedReceipt[]) {
    return source.filter((r) => {
    const taxMatch = filter === "すべて" ||
      (filter === "8%" ? r.tax_8_base > 0 : r.tax_10_base > 0);
    const textMatch = !query || `${r.merchant_name} ${r.items.map((i) => i.name).join(" ")}`
      .toLowerCase().includes(query.toLowerCase());
    return taxMatch && textMatch;
    });
  }

  const selectedYear = selectedMonth.getFullYear();
  const selectedMonthNumber = selectedMonth.getMonth() + 1;
  const monthKey = `${selectedYear}-${String(selectedMonthNumber).padStart(2, "0")}`;
  const monthLabel = `${selectedYear}年${selectedMonthNumber}月`;
  const purchaseMonthReceipts = receipts.filter((receipt) => receipt.purchase_date?.startsWith(monthKey));
  const scannedMonthReceipts = receipts.filter((receipt) => {
    const created = new Date(receipt.created_at);
    return created.getFullYear() === selectedYear && created.getMonth() + 1 === selectedMonthNumber;
  });
  const visibleExpenses = filterReceipts(purchaseMonthReceipts);
  const historyReceipts = filterReceipts(receipts);
  const monthlyTotal = purchaseMonthReceipts.reduce((sum, r) => sum + r.total_amount, 0);
  const monthlyTax = purchaseMonthReceipts.reduce((sum, r) => sum + r.total_tax_amount, 0);
  const scannedTotal = scannedMonthReceipts.reduce((sum, r) => sum + r.total_amount, 0);
  const scannedTax = scannedMonthReceipts.reduce((sum, r) => sum + r.total_tax_amount, 0);
  const tax8Base = scannedMonthReceipts.reduce((sum, r) => sum + r.tax_8_base, 0);
  const tax8Amount = scannedMonthReceipts.reduce((sum, r) => sum + r.tax_8_amount, 0);
  const tax10Base = scannedMonthReceipts.reduce((sum, r) => sum + r.tax_10_base, 0);
  const tax10Amount = scannedMonthReceipts.reduce((sum, r) => sum + r.tax_10_amount, 0);
  const merchantTotals = Object.entries(
    scannedMonthReceipts.reduce<Record<string, number>>((totals, receipt) => {
      const merchant = receipt.merchant_name || "購入先不明";
      totals[merchant] = (totals[merchant] || 0) + receipt.total_amount;
      return totals;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const historyGroups = Object.entries(
    historyReceipts.reduce<Record<string, SavedReceipt[]>>((groups, receipt) => {
      const date = receipt.purchase_date || "日付不明";
      (groups[date] ||= []).push(receipt);
      return groups;
    }, {})
  ).sort((a, b) => b[0].localeCompare(a[0]));

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  function moveMonth(offset: number) {
    setSelectedMonth((current) =>
      new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function showMerchantReceipts(merchant: string) {
    setQuery(merchant === "購入先不明" ? "" : merchant);
    setFilter("すべて");
    switchTab("history");
  }

  function receiptCards(items: SavedReceipt[]) {
    return (
      <div className="receipt-list">
        {items.map((receipt) => (
          <button className="receipt-card" key={receipt.id} onClick={() => setSelected(receipt)}>
            <div className="receipt-thumb">
              {receipt.image_url ? <img src={receipt.image_url} alt="" /> : <ReceiptText size={25} />}
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
    );
  }

  async function deleteReceipt(receipt: SavedReceipt) {
    if (!window.confirm(`${receipt.merchant_name || "この領収書"}を削除しますか？\nこの操作は取り消せません。`)) return;
    setError("");
    try {
      const res = await fetch("/api/receipts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "x-app-password": password } : {})
        },
        body: JSON.stringify({ id: receipt.id })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReceipts((current) => current.filter((item) => item.id !== receipt.id));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
    }
  }

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
        <nav className="header-tabs" aria-label="表示メニュー">
          <button className={activeTab === "expenses" ? "active" : ""} onClick={() => switchTab("expenses")}>今月の支出</button>
          <button className={activeTab === "scanned" ? "active" : ""} onClick={() => switchTab("scanned")}>今月の集計</button>
          <button className={activeTab === "history" ? "active" : ""} onClick={() => switchTab("history")}>履歴</button>
        </nav>
      </header>

      <section className="content">
        {demo && (
          <div className="demo-note">
            <Sparkles size={16} />
            <span>デモ表示中 — Supabaseを接続すると撮影・保存できます</span>
          </div>
        )}
        {error && <div className="error-note">{error}</div>}

        {activeTab === "expenses" && <><section className="hero">
          <div>
            <div className="month-switcher">
              <button onClick={() => moveMonth(-1)} aria-label="前月"><ChevronLeft size={20} /></button>
              <span className="eyebrow">{monthLabel}</span>
              <button onClick={() => moveMonth(1)} aria-label="翌月"><ChevronRight size={20} /></button>
            </div>
            <h1>月間支出</h1>
          </div>
          <p className="total">{yen.format(monthlyTotal)}</p>
          <div className="stats">
            <span><b>{purchaseMonthReceipts.length}</b> 枚のレシート</span>
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
        </section>
        </>}

        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            void chooseImage(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />

        {activeTab === "expenses" && <section ref={contentRef} className="list-section">
          <div className="section-heading">
            <div><p>購入日のレシート</p><span>{visibleExpenses.length}件</span></div>
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
          ) : visibleExpenses.length === 0 ? (
            <div className="empty"><ReceiptText /> 該当するレシートはありません</div>
          ) : (
            receiptCards(visibleExpenses)
          )}
        </section>}

        {activeTab === "scanned" && <section ref={contentRef} className="summary-section">
          <div className="summary-heading">
            <div>
              <div className="month-switcher">
                <button onClick={() => moveMonth(-1)} aria-label="前月"><ChevronLeft size={20} /></button>
                <span className="eyebrow">{monthLabel}</span>
                <button onClick={() => moveMonth(1)} aria-label="翌月"><ChevronRight size={20} /></button>
              </div>
              <h2>読み取り月の集計</h2>
            </div>
            <span>{scannedMonthReceipts.length}枚</span>
          </div>
          <div className="summary-total">
            <span>支出合計</span>
            <b>{yen.format(scannedTotal)}</b>
            <small>うち消費税 {yen.format(scannedTax)}</small>
          </div>
          <h3>税率別の内訳</h3>
          <div className="summary-tax-grid">
            <div className="summary-tax-card tax8-card">
              <strong>軽減税率 8%</strong>
              <span>対象額</span>
              <b>{yen.format(tax8Base)}</b>
              <em>消費税 <b>{yen.format(tax8Amount)}</b></em>
            </div>
            <div className="summary-tax-card tax10-card">
              <strong>標準税率 10%</strong>
              <span>対象額</span>
              <b>{yen.format(tax10Base)}</b>
              <em>消費税 <b>{yen.format(tax10Amount)}</b></em>
            </div>
          </div>
          <h3>購入先別</h3>
          <div className="merchant-summary">
            {merchantTotals.length === 0 ? (
              <div className="empty"><ReceiptText /> まだレシートがありません</div>
            ) : merchantTotals.map(([merchant, amount], index) => (
              <button key={merchant} onClick={() => showMerchantReceipts(merchant)}>
                <span className="rank">{index + 1}</span>
                <b>{merchant}</b>
                <strong>{yen.format(amount)}</strong>
              </button>
            ))}
          </div>
          <h3>この月に読み取ったレシート</h3>
          {loading ? (
            <div className="empty"><LoaderCircle className="spin" /> 読み込み中</div>
          ) : scannedMonthReceipts.length === 0 ? (
            <div className="empty"><ReceiptText /> この月に読み取ったレシートはありません</div>
          ) : receiptCards(scannedMonthReceipts)}
        </section>}

        {activeTab === "history" && <section ref={contentRef} className="history-section">
          <div className="section-heading">
            <div><p>すべての履歴</p><span>{historyReceipts.length}件</span></div>
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
          ) : historyGroups.length === 0 ? (
            <div className="empty"><ReceiptText /> 該当するレシートはありません</div>
          ) : historyGroups.map(([date, items]) => (
            <div className="history-day" key={date}>
              <div className="history-date">
                <b>{date === "日付不明" ? date : `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`}</b>
                <span>{items.length}件・{yen.format(items.reduce((sum, item) => sum + item.total_amount, 0))}</span>
              </div>
              {receiptCards(items)}
            </div>
          ))}
        </section>}
      </section>

      <nav className="bottom-nav scan-only">
        <button onClick={() => fileRef.current?.click()}><span className="nav-camera"><Camera size={24} /></span><span>読み取る</span></button>
      </nav>

      {previews.length > 0 && (
        <div className="modal-backdrop">
          <section className="upload-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title">
              <div><span><ImageIcon size={20} /></span><div><b>この画像を読み取りますか？</b><small>AIが日付・商品・税率を自動で整理します</small></div></div>
              <button onClick={closeUpload}><X /></button>
            </div>
            <div className={`preview-grid ${previews.length === 2 ? "two" : ""}`}>
              {previews.map((preview, index) => (
                <div key={preview}>
                  <span>{index === 0 ? "上・1枚目" : "下・2枚目"}</span>
                  <img className="preview" src={preview} alt={`選択した領収書 ${index + 1}`} />
                </div>
              ))}
            </div>
            {previews.length < 2 && (
              <button className="add-image-button" onClick={() => fileRef.current?.click()}>
                <Plus size={18} /> 長いレシートの2枚目を追加
              </button>
            )}
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
            <div className="detail-images">
              {(selected.image_urls?.length ? selected.image_urls : [selected.image_url]).filter(Boolean).map((url, index) => (
                <a href={url} target="_blank" key={url}><img className="detail-image" src={url} alt={`領収書 ${index + 1}`} /></a>
              ))}
            </div>
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
            <button className="delete-button" onClick={() => void deleteReceipt(selected)}>
              <Trash2 size={18} /> この領収書を削除
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
