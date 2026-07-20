# レシートポケット

iPhoneのカメラまたは写真ライブラリから領収書を送信し、Google Geminiで読み取り、Supabaseへ保存するNext.jsアプリです。

## 保存するデータ

- 購入日・時間・購入先・合計金額・小計
- 商品名・数量・単価・金額・適用税率（8% / 10% / 不明）
- 税率別の対象金額と消費税額、消費税合計
- Supabase Storageに保存した領収書画像の公開URL

## 1. Supabaseを準備

1. Supabaseで新しいプロジェクトを作成します。
2. SQL Editorで `supabase/migrations/001_receipts.sql` を実行します。
3. Project Settings → APIからProject URL、anon key、service_role keyを取得します。

service_role keyは強い権限を持つため、ブラウザやGitHubへ公開しないでください。このアプリではサーバー内だけで使用します。

## 2. 環境変数

`.env.example` を参考にVercelのProject Settings → Environment Variablesへ次を登録します。

| 変数 | 内容 |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studioで再発行したGemini APIキー |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `APP_PASSWORD` | 任意。小規模な私用環境向け共通パスワード |

この会話に貼り付けたGoogle APIキーは露出済みです。Google AI Studioで新しいキーを発行し、古いキーを無効化してから新しいキーをVercelに登録してください。

## 3. ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

環境変数がない状態では、一覧画面を確認できるデモモードになります。実際の画像解析・保存にはGoogleとSupabaseの設定が必要です。

## 4. GitHubとVercel

1. このフォルダをGitHubリポジトリへpushします。
2. VercelでAdd New → ProjectからそのリポジトリをImportします。
3. Environment Variablesを登録しDeployします。
4. 以後は`main`へのpushで本番が自動更新されます。

## iPhoneで使う

SafariでVercelのURLを開き、「共有」→「ホーム画面に追加」を選びます。「レシートを読み取る」で背面カメラが起動し、撮影後にAI解析・画像保存・DB登録まで行います。

## セキュリティ上の注意

要件に従い画像URLは公開URLです。URLを知る人は画像を閲覧できます。領収書に個人情報が含まれる場合は、Storageを非公開bucketにして期限付き署名URLを発行する方式への変更を推奨します。また、`APP_PASSWORD`は簡易保護です。複数ユーザーで使う場合はSupabase Authを追加してください。
