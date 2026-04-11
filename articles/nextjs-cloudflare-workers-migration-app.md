---
title: "Next.jsブログをAWS App RunnerからCloudflare Workersへ移行した話（アプリ編）"
emoji: "☁️"
type: "tech"
topics: ["nextjs", "cloudflare", "opennext", "workers", "typescript"]
published: false
---

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

今回は **個人ブログ（Next.js 16 + microCMS）をAWS App RunnerからCloudflare Workersへ移行した話** を紹介していきます！本記事では**アプリケーション側の修正**にフォーカスし、移行で直面した問題と解決策を共有します。インフラ編は[こちら](https://zenn.dev/ryota_and/articles/nextjs-cloudflare-workers-migration-infra)です。

## 📌 移行の背景

AWSから**App Runnerへの新機能追加の終了**がアナウンスされました。**2026年4月30日**以降は新規顧客への提供が停止され、既存顧客は引き続き利用可能ですが、今後新機能が追加される予定はありません。AWSとしては**Amazon ECS Express Mode**への移行を推奨しています。

https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html

個人ブログという規模を考えると、ECSはややオーバースペックに感じました。せっかくならインフラ構成ごと見直そうと思い、エッジ配信が魅力的なCloudflare Workersへの移行を決めました。

App Runnerは「Dockerイメージを渡すだけでWebアプリが動く」というシンプルさが本当に素晴らしいサービスでした。VPCやALBの設定を意識せず、個人開発でもプロダクション品質のコンテナホスティングができる点にとても助けられました。約2年間、安定して動き続けてくれたことに感謝しています🙏

## 📌 移行前後の構成

### 移行前（AWS）

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16.0.7 (App Router) |
| デプロイ | Docker → AWS ECR → App Runner |
| CDN | CloudFront |
| CMS | microCMS |
| 監視 | AWS CloudWatch RUM |
| i18n | next-intl (ja/en) |

### 移行後（Cloudflare）

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16.2.3 (App Router) |
| デプロイ | OpenNext → Cloudflare Workers |
| CDN | Cloudflare（エッジ配信） |
| キャッシュ | R2 (ISR) + D1 (タグキャッシュ) + Durable Objects (リバリデーション) |
| 監視 | Cloudflare Web Analytics |

## 📌 バージョン選定 ── 最初にして最大のハマりポイント

移行を始めてまず直面したのが、**現行のNext.js 16.0.7が`@opennextjs/cloudflare`のどのバージョンでもサポートされていない**という事実でした😅

```
@opennextjs/cloudflare の Next.js 16 最小要件: 16.0.10
最新 v1.19.0 の要件: >= 16.2.3（CVE-2026-23869 対応）
```

OpenNextチームの[playground16](https://github.com/opennextjs/opennextjs-cloudflare/tree/main/examples/playground16)を参考に、CIのE2Eテストで検証済みの組み合わせを採用しました。

```json:package.json
{
  "next": "16.2.3",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "@opennextjs/cloudflare": "^1.19.0",
  "wrangler": "^4.65.0"
}
```

**選定の根拠:**

- OpenNextのCIが`next@16.2.3`でテストされている
- OG画像生成バグがv1.18.1で修正済み（Next 16.2.2向け）
- `use cache`バグがv1.19.0で修正済み
- セキュリティCVE-2026-23869対応済み

:::message
調査段階で以下の成功事例も確認できました。

- **Lewis Kori** (2026-04): Next.js 16.2 × 3アプリのNxモノレポをCloudflare Workersで本番運用
- **Hello Tech (AutoReserve)**: OpenNext + Cloudflare Workersで月額コスト90%削減
- **Yasir Gaji**: Next.js 16をVercel → Cloudflare Workersに移行成功
:::

## 📌 Cloudflare Workersで動かないコードの特定と修正

Cloudflare Workersは**Node.jsランタイムではなくworkerd**で動作するため、いくつかのNode.js APIが使えません。事前にコードベースを全検索し、4種類の非互換箇所を特定しました。

### 1. `fs`モジュール ── OG画像のフォント読み込み

**発生していた症状:** OG画像生成で`fs.readFileSync`を使ってフォントファイルを読み込んでいた

```tsx:opengraph-image.tsx
// Before: Node.js の fs でローカルファイルを読み込み
import fs from "fs";
import path from "path";

const fontData = fs.readFileSync(
  path.join(process.cwd(), "public/KosugiMaru-Regular.ttf"),
);
```

**解決策:** Google Fonts CDNから`fetch()`で取得。Cloudflareのエッジキャッシュ（`cf.cacheTtl`）を活用し、毎リクエストの外部通信を回避しました。

```tsx:opengraph-image.tsx
// After: Google Fonts CDN から fetch + エッジキャッシュ
const fontResponse = await fetch(
  "https://fonts.gstatic.com/s/kosugimaru/v17/0nksC9PgP_wGh21A2KeqGiTq.ttf",
  { cf: { cacheTtl: 86400 } } as RequestInit,
);
if (!fontResponse.ok) {
  throw new Error(`フォントの取得に失敗しました: ${fontResponse.status}`);
}
const fontData = await fontResponse.arrayBuffer();
```

:::message alert
Worker自身の静的アセットへのリクエスト（self-referencing）は[GitHub Issue #602](https://github.com/opennextjs/opennextjs-cloudflare/issues/602)で問題が報告されています。外部CDNからの取得が安全です。
:::

### 2. `sharp` / `plaiceholder` ── blurプレースホルダー生成

**発生していた症状:** `ImageWithBlur`コンポーネントが`fs.readFile` + `getPlaiceholder`（sharp依存）でランタイムにblurデータURLを生成していた

```tsx:ImageWithBlur/index.tsx
// Before: ランタイムで sharp を使って blur 生成
import { getPlaiceholder } from 'plaiceholder'
import fs from "node:fs/promises";

const ImageWithBlur = async ({ src, alt, ...props }) => {
  const buffer = await fs.readFile(`./public${src}`)
  const { base64 } = await getPlaiceholder(buffer)
  return <Image {...props} src={src} alt={alt} placeholder="blur" blurDataURL={base64} />
}
```

使用箇所がAboutページの著者アバター1箇所だけだったため、blurプレースホルダーを省略するシンプルな実装に変更しました。

```tsx:ImageWithBlur/index.tsx
// After: blur なしのシンプルな Image コンポーネント
const ImageWithBlur = ({ className = "", src, alt, ...restProps }) => {
  return (
    <Image {...restProps} className={className} src={src} alt={alt} placeholder="empty" />
  )
}
```

`sharp`は`devDependencies`に移動し、`plaiceholder`は削除しました。

### 3. AWS RUM ── モニタリングの置き換え

`aws-rum-web`を使ったCloudWatch RUMの初期化コードが50行以上ありましたが、Cloudflare Web Analyticsはドメインがプロキシされていれば**ダッシュボードから有効化するだけでJSビーコンが自動挿入**されるため、クライアント側のコードを全削除しました🎉

```tsx:ClientLayout/index.tsx
// Before: 50行以上の AWS RUM 初期化コード
import { AwsRum } from "aws-rum-web";
// useEffect 内で AwsRum を初期化...

// After: パススルーコンポーネントに
const ClientLayout = ({ children }) => {
  return <>{children}</>
}
```

### 4. Middlewareの AWS固有コード

App Runnerのホスト名を直接参照するチェックが不要になったため削除しました。

```diff
- if (request.nextUrl.hostname.includes('awsapprunner')) {
-   return NextResponse.redirect(new URL('/404', request.url))
- }
```

## 📌 OpenNext + Cloudflareの設定

### `open-next.config.ts`

ISRのためにR2（インクリメンタルキャッシュ）、Durable Objects（リバリデーションキュー）、D1（タグキャッシュ）を設定します。

```ts:open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

const isProduction = process.env.NODE_ENV === "production";

export default defineCloudflareConfig({
  ...(isProduction && {
    incrementalCache: r2IncrementalCache,
    queue: doQueue,
    tagCache: d1NextTagCache,
  }),
});
```

:::message
**ポイント:** ローカル開発時はR2/DO/D1が利用できないため、`isProduction`で条件分岐しています。
:::

### `wrangler.jsonc`の環境分離

stg / prdでWorker名、R2バケット名、D1データベースが異なるため、**ファイルを分離**しました。

```jsonc:wrangler.stg.jsonc
{
  "name": "ryota-blog-stg",
  "compatibility_date": "2026-04-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public", "enable_request_signal"],
  "r2_buckets": [{
    "binding": "NEXT_INC_CACHE_R2_BUCKET",
    "bucket_name": "ryota-blog-cache-stg"
  }],
  "d1_databases": [{
    "binding": "NEXT_TAG_CACHE_D1",
    "database_name": "ryota-blog-tags-stg",
    "database_id": "809a6a0c-619e-40bc-9461-6e97782c3d7a"
  }],
  "durable_objects": {
    "bindings": [{
      "name": "NEXT_CACHE_DO_QUEUE",
      "class_name": "DOQueueHandler"
    }]
  }
}
```

デプロイスクリプトも環境別に定義しています。

```json:package.json
{
  "deploy:stg": "opennextjs-cloudflare build --config wrangler.stg.jsonc && opennextjs-cloudflare deploy --config wrangler.stg.jsonc",
  "deploy:prd": "opennextjs-cloudflare build --config wrangler.prd.jsonc && opennextjs-cloudflare deploy --config wrangler.prd.jsonc"
}
```

### CI/CD

GitHub Actionsで`main` → prd、`staging` → stgに自動判定してデプロイするワークフローを作成しました。

```yaml:deploy-cloudflare.yml
- name: Set deploy environment
  id: set-env
  run: |
    if [[ "${{ github.ref }}" == "refs/heads/main" ]] || [[ "${{ github.event_name }}" == "repository_dispatch" ]]; then
      echo "env=prd" >> $GITHUB_OUTPUT
    else
      echo "env=stg" >> $GITHUB_OUTPUT
    fi

- name: Build and Deploy to Cloudflare Workers (${{ steps.set-env.outputs.env }})
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  run: npm run deploy:${{ steps.set-env.outputs.env }}
```

旧AWSデプロイワークフローは`workflow_dispatch`（手動実行のみ）に変更し、ロールバック用に残しています。

## 📌 ハマったポイントと試行錯誤

### 1. `initOpenNextCloudflareForDev()`でdevサーバーがハング

`next.config.mjs`にOpenNextのdev初期化を追加したところ、`npm run dev`でサーバーが起動はするものの**リクエストに一切応答しなくなりました**😅

```
✓ Ready in 291ms
workerd/server/server.c++:1948: warning: A DurableObjectNamespace in the config
referenced the class "DOQueueHandler", but no such Durable Object class is
exported from the worker.
```

**原因:** `initOpenNextCloudflareForDev()`が`wrangler.jsonc`を読み込んで内部的にworkerdを起動するが、DOQueueHandlerクラスがWorkerバンドルにないためハングしていました。

**対処:** ローカル開発では`initOpenNextCloudflareForDev()`をコメントアウト。R2/DO/D1バインディングが不要な通常の開発は`next dev`で十分動作します。

### 2. RSCヘッダーがCloudflare上でリダイレクトを壊す

デプロイ後、トップページ（`/`）にアクセスすると画面が真っ白になる問題が発生しました。調査すると、`/` → `/ja` → `/ja/blogs`のリダイレクトチェーンで**`Content-Type: text/x-component`**が設定され、ブラウザがHTMLを解釈できていませんでした。

```js:next.config.mjs
// これが原因だった
async headers() {
  return [{
    source: '/:path*',
    has: [{ type: 'query', key: '_rsc' }],
    headers: [
      { key: 'Content-Type', value: 'text/x-component; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-store' }
    ],
  }];
},
```

**対処:** Next.jsはRSCレスポンスのContent-Typeを自動設定するため、このカスタムヘッダーは不要でした。全削除で解決！

### 3. Storybookのpeer dependency競合

Next.js 16.2.3にアップグレードしたところ、`npm ci`で以下のエラーが発生。

```
npm error ERESOLVE could not resolve
npm error @storybook/nextjs@8.1.6 requires next@^13.5.0 || ^14.0.0
```

**対処:** `.npmrc`に`legacy-peer-deps=true`を追加しました。

### 4. StorybookがNext.js 16でビルドできない

Next.js 16で`next/config`モジュールが削除されたため、`@storybook/nextjs`がエラーを出しました。

```
Error: Cannot find module 'next/config'
```

**対処:** フレームワークアダプターを`@storybook/nextjs` → `@storybook/react-vite`に切り替えました。ただし以下の3つの追加対応が必要でした。

**(a) `next/font/google`が使えない**

```css:.storybook/storybook.css
/* CSS @import で代替 */
@import url('https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap');
```

**(b) `next/image`が動作しない**

モックコンポーネントを作成し、Viteの`resolve.alias`で差し替えました。

```tsx:.storybook/mocks/next-image.tsx
const MockImage = (props) => {
  const { fill, ...rest } = props;
  const style = fill
    ? { position: "absolute", width: "100%", height: "100%", objectFit: "cover" }
    : {};
  return <img {...rest} style={{ ...style, ...(rest.style || {}) }} />;
};
export default MockImage;
```

**(c) `@/`パスエイリアスが解決されない**

`viteFinal`で手動設定が必要です。

```ts:.storybook/main.ts
viteFinal: async (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    "@": path.resolve(__dirname, "../src"),
    "next/image": path.resolve(__dirname, "./mocks/next-image.tsx"),
    "next/link": path.resolve(__dirname, "./mocks/next-link.tsx"),
  };
  return config;
},
```

### 5. `opennextjs-cloudflare build`が設定ファイルを見つけられない

`deploy`コマンドには`--config`を渡していたが、`build`コマンドに渡し忘れていました。

```json
// Before（buildに--configがない）
"deploy:prd": "opennextjs-cloudflare build && opennextjs-cloudflare deploy --config wrangler.prd.jsonc"

// After（両方に渡す）
"deploy:prd": "opennextjs-cloudflare build --config wrangler.prd.jsonc && opennextjs-cloudflare deploy --config wrangler.prd.jsonc"
```

## 📌 環境変数の整理

### GitHub Secrets（CI/CD）

| 変数 | 用途 |
|------|------|
| `CLOUDFLARE_API_TOKEN` | **新規追加** Wranglerデプロイ認証 |
| `CLOUDFLARE_ACCOUNT_ID` | **新規追加** アカウント識別 |
| `NEXT_PUBLIC_BASE_URL` | 維持（ビルド時インライン） |
| `MICROCMS_SERVICE_DOMAIN` | 維持（ビルド時 + ランタイム） |
| `MICROCMS_API_KEY` | 維持（ビルド時 + ランタイム） |

### Cloudflare Workersシークレット

SSRページがランタイムでmicroCMS APIを呼ぶため、Workers側にもシークレットが必要です。

```bash
wrangler secret put MICROCMS_SERVICE_DOMAIN
wrangler secret put MICROCMS_API_KEY
```

AWS RUM関連の3変数（`NEXT_PUBLIC_GUEST_ROLE_ARN`等）は不要になりました。

## 📌 まとめ

今回の移行により：

- **インフラの簡素化**: Dockerfile、ECR、App Runner、CloudFrontが不要に
- **エッジ配信**: Cloudflareのグローバルエッジネットワークで配信
- **コスト削減**: Workers有料プラン$5/月〜（App Runner + CloudFrontと比較して大幅削減）
- **ISR完全対応**: R2 + Durable Objects + D1でISR/オンデマンドrevalidationが動作
- **StorybookもCloudflare Pagesで配信**: Workersとは別に静的サイトとしてデプロイ

移行で学んだことをまとめると以下の通りです。

1. **バージョン選定は最初に徹底調査する** ── OpenNextのpeer dependencyとGitHub Issuesを確認し、CIテスト済みの組み合わせを使うこと
2. **`fs`を使っている箇所を全検索する** ── Cloudflare Workersでは`fs`が使えない。`grep -r "from ['\"]fs" src/`で事前に洗い出す
3. **カスタムヘッダーは要注意** ── App Runnerで問題なくても、Workersのリダイレクト処理で予期しない伝播が起きる
4. **ローカル開発と本番の差異を意識する** ── `initOpenNextCloudflareForDev()`はDurable Objects等のバインディングがあるとハングする可能性がある
5. **StorybookはNext.jsのメジャーアップグレードで壊れやすい** ── `@storybook/nextjs`はNext.jsの内部APIに依存しているため、`@storybook/react-vite`への切り替えが必要になることがある

同じようにNext.jsアプリをCloudflare Workersに移行しようとしている方の参考になれば幸いです！

インフラ側の詳細（Terraform、DNS移行、コスト比較など）は[インフラ編](https://zenn.dev/ryota_and/articles/nextjs-cloudflare-workers-migration-infra)で紹介しています。

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺
