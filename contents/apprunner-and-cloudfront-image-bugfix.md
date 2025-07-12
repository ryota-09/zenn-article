---
title: "CloudFrontにするとApp Runner(& Next.js)で動いているアプリの画像が表示されない問題を解決した話"
emoji: "📝"
type: "tech"
topics: ["Terraform", "AWS", "Next.js"]
published: true
created_at: "2025-06-21T02:47:14.220Z"
published_at: "2025-06-21T02:47:14.220Z"
---

CloudFrontとNext.jsの組み合わせで発生する画像最適化エラー「url parameter is not allowed」の完全解決ガイド。AllViewerExceptHostHeaderポリシーを使った根本的解決策、段階的なデバッグ手順、実装例を詳しく解説します。

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

今回は、**CloudFrontとNext.jsの組み合わせで発生する画像最適化エラー**について、実際に遭遇した問題とその完全解決までの道のりを詳しく解説していきます！

この記事は、ステージング環境でCloudFront経由でアクセスした際に「`"url" parameter is not allowed`」エラーで悩んでいる方、App RunnerとCloudFrontの連携で画像が表示されない方に特に参考になると思います。

## 問題の概要 📋

### 発生していた症状

まず最初に、今回遭遇した問題の詳細をお話しします。

**環境構成**

- **バックエンド**: AWS App Runner
- **CDN**: CloudFront
- **フレームワーク**: Next.js（画像最適化機能を使用）

**ブラウザ画面**

画像が非表示になっています**...😇**

![](https://images.microcms-assets.io/assets/4626924a681346e9a0fcabe5478eb9fa/ce100f55cf7f4022b6c24e8c01158d56/image-404.png)

**エラー内容**

```
/_next/image?url=%2Ficons%2Fgithub.webp&w=48&q=75
↓
400 Bad Request: "url" parameter is not allowed
```

このエラー、見たことある方いませんか？😅 CloudFrontドメイン（`xxxxxx.cloudfront.net`）経由でアクセスすると、サイト自体は表示されるのに画像だけが真っ白になってしまう現象です。

### なぜこの問題が起きるのか？

調査を進める中で、この問題の根本原因が3つあることが分かりました：

1. **Host Headerの不一致問題**
   - CloudFrontからApp RunnerへのリクエストでHostヘッダーがCloudFrontドメインのまま送信される
   - App Runnerが自身のドメイン名でのリクエストを期待しているため、正しくルーティングできない
   - 具体例：CloudFrontは`Host: xxxxxx.cloudfront.net`でリクエストするが、App Runnerは`Host: xxxxx.ap-northeast-1.awsapprunner.com`を期待している

2. **クエリパラメータの転送不備**
   - Next.jsの画像最適化に必要な`url`, `w`, `q`パラメータが適切に転送されない
   - CloudFrontの設定によってはクエリパラメータが破棄される
   - 例：`/_next/image?url=%2Ficons%2Fgithub.webp&w=48&q=75`のパラメータが到達しない

3. **ベースURL設定の矛盾**
   - `NEXT_PUBLIC_BASE_URL`の設定とアクセス先ドメインの不一致
   - この設定ミスが循環依存エラーを引き起こすことも
   - Next.jsが内部的に画像最適化のURLを生成する際に、不正なベースURLを参照してしまう

### Next.js画像最適化の仕組み

Next.jsの画像最適化機能について簡単に説明します：

```jsx
// Next.jsのImageコンポーネント使用例
import Image from 'next/image'

export default function MyComponent() {
  return (
    <Image
      src="/icons/github.webp"
      alt="GitHub Icon"
      width={48}
      height={48}
    />
  )
}
```

このコンポーネントは実際には以下のようなURLを生成します：

```
/_next/image?url=%2Ficons%2Fgithub.webp&w=48&q=75
```

- `url`: 元画像のパス（URLエンコード済み）
- `w`: 表示幅（width）
- `q`: 品質（quality、1-100の値）

この`/_next/image`エンドポイントがNext.jsの画像最適化APIで、リアルタイムで画像をリサイズ・最適化して返します。そのため、**このエンドポイントに正しくクエリパラメータが届かないと画像が表示されません**。

最初は「なんで画像だけエラーになるんだ...？」と思いましたが、画像最適化機能だけが特殊なクエリパラメータを必要とするため、他のリソースは正常に表示されていたんですね。

## 解決までの試行錯誤の過程 🔍

### 第1段階: 初期診断と基本的な修正

最初に試したのは、基本的な設定の見直しでした。

```bash
# Terraformの設定確認
terraform plan
terraform apply

# App RunnerとCloudFrontの状態確認
aws apprunner describe-service --service-arn xxx
aws cloudfront get-distribution --id xxx
```

この段階で`NEXT_PUBLIC_BASE_URL`をCloudFrontドメインに変更したのですが、これが**大きな間違い**でした😅

```hcl
// ❌ 間違った設定
NEXT_PUBLIC_BASE_URL=https://xxxxxx.cloudfront.net

// この設定により循環依存エラーが発生
```

循環依存エラーが発生し、App Runnerサービス自体が不安定になってしまいました。

**循環依存エラーの詳細：**

- Next.jsアプリが`NEXT_PUBLIC_BASE_URL`で指定されたCloudFrontドメインを参照
- CloudFrontがそのリクエストを再びApp Runnerに転送
- App Runnerが再度CloudFrontドメインにリダイレクト
- この繰り返しで無限ループが発生

この時点で「基本的な設定変更だけでは解決しない」ことを理解しました。

### 第2段階: CloudFront設定の詳細調整

次に試したのは、CloudFrontの設定をより細かく調整することでした。

```hcl
# 試行した設定例
ordered_cache_behavior {
  path_pattern     = "_next/image*"
  allowed_methods  = ["GET", "HEAD", "OPTIONS"]
  cached_methods   = ["GET", "HEAD", "OPTIONS"]
  
  cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  origin_request_policy_id   = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewer
}
```

この設定で一時的に改善が見られたのですが、`AllViewer`ポリシーがApp Runnerとの互換性問題を起こしました。特に、Host Headerの扱いで予期しない動作が発生し、他のエンドポイントにも影響が出始めました。

**AllViewerポリシーで発生した具体的な問題：**

- Host HeaderがCloudFrontドメインのまま転送される
- App RunnerのルーティングがCORSエラーを引き起こす
- 他のAPIエンドポイント（`/api/*`）にも影響が波及
- レスポンスタイムが異常に長くなる（タイムアウト発生）

「マネージドポリシーってたまに罠があるよなー...」と思いながら、次の手法を試すことにしました。

### 第3段階: 従来設定への回帰

マネージドポリシーでの問題を受けて、従来の`forwarded_values`設定に一度戻してみました。

```hcl
# 試行した設定例
forwarded_values {
  query_string = true  # すべてのクエリパラメータを転送
  headers      = ["Origin", "Accept", "Host"]
  
  cookies {
    forward = "none"
  }
}
```

この設定により、サイトは表示されるようになったのですが、**画像の400エラーは依然として継続**していました。

この時点で「設定の問題ではなく、もっと根本的な部分に原因がある」と確信し、より深い調査を始めました。

## 最終解決策の発見と実装 💡

### 根本原因の特定

Web上での情報収集により、以下の重要な事実が判明しました：

- **CloudFrontの**`CORS-S3Origin`**ポリシーはクエリパラメータを転送しない**
  - S3向けに設計されたポリシーで、動的なクエリパラメータの転送に対応していない
  - Next.jsの画像最適化のような動的処理には不適切

- **App RunnerはHostヘッダーに自身のドメイン名が必要**
  - App Runnerのルーティング機能は、Host Headerを基にリクエストを識別
  - CloudFrontドメインのHostヘッダーでは、App Runnerが適切に処理できない

- `AllViewerExceptHostHeader`**ポリシーがこの問題の解決策**
  - Host Header以外のすべてのリクエスト情報を転送
  - Host HeaderはCloudFrontが自動的にオリジンドメインに書き換え

**参考になった情報源：**

- [AWS CloudFront managed policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)
- [App Runner Host header requirements](https://docs.aws.amazon.com/apprunner/latest/dg/manage-custom-domains.html)

この発見が転換点でした！🎉

### 最終的な解決策の実装

**1. データソースの追加**

```hcl
# AllViewerExceptHostHeaderポリシーのデータソース追加
data "aws_cloudfront_origin_request_policy" "all_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
```

**2. 全キャッシュ動作の統一**

```hcl
# デフォルトキャッシュ動作
default_cache_behavior {
  cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_except_host.id
  # 他の設定...
}

# 画像最適化専用の動作
ordered_cache_behavior {
  path_pattern               = "_next/image*"
  cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_except_host.id
  # 他の設定...
}

# 静的アセット用の動作
ordered_cache_behavior {
  path_pattern               = "_next/static/*"
  cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_except_host.id
  # 他の設定...
}
```

## 使用したAWSマネージドポリシーの詳細 📊

今回の解決に使用したマネージドポリシーを表にまとめました：

| ポリシー名 | ポリシーID | 用途 | 重要なポイント |
|---|---|---|---|
| **AllViewerExceptHostHeader** | `b689b0a8-53d0-40ab-baf2-68738e2966ac` | Host Header自動書き換え | 🔑 最重要ポリシー |
| **CachingDisabled** | `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` | 画像最適化（動的処理） | リアルタイム処理用 |
| **CachingOptimized** | `658327ea-f89d-4fab-a63d-7e88639e58f6` | 静的アセットキャッシュ | パフォーマンス向上 |

### AllViewerExceptHostHeaderポリシーが重要な理由

このポリシーの素晴らしい点は以下の通りです：

1. **Host Header の自動書き換え**
   - CloudFrontがHost HeaderをApp Runnerドメインに自動で変更
   - App Runnerが正しくルーティング可能になる
   - 例：`Host: xxxxxx.cloudfront.net` → `Host: xxxxx.ap-northeast-1.awsapprunner.com`

2. **完全なリクエスト情報の転送**
   - すべてのクエリパラメータ（`url`, `w`, `q`など）を確実に転送
   - Accept, User-Agent, Authorizationなどの重要なヘッダー情報も適切に転送
   - Cookieやリファラー情報も保持

3. **設定の簡潔性**
   - 複雑な`forwarded_values`設定が不要
   - 個別にヘッダーやクエリパラメータを指定する必要なし
   - AWSが管理するため、将来的な互換性も安心

4. **パフォーマンスの最適化**
   - 不要なHost Headerの転送を避けることで、オーバーヘッドを削減
   - App Runnerでのルーティング処理が高速化
   - CDNキャッシュの効率性も向上

**従来のforwarded_values設定との比較：**

```hcl
# ❌ 従来の複雑な設定
forwarded_values {
  query_string = true
  headers = [
    "Authorization", 
    "Accept", 
    "Accept-Language", 
    "Accept-Encoding",
    "Origin",
    "Referer",
    "User-Agent"
    # Host は除外する必要があるが、個別指定が面倒
  ]
  cookies {
    forward = "all"
  }
}

# ✅ AllViewerExceptHostHeaderポリシー使用
origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id
# 上記1行で完了！
```

## 検証結果と効果 ✅

### 修正前の状況

- ❌ CloudFront経由でサイトにアクセス可能だが、画像が表示されない
- ❌ `/_next/image`エンドポイントで400 Bad Request
- ❌ Host Header不一致とクエリパラメータ転送不備

### 修正後の状況

- ✅ CloudFront経由で画像を含めてサイトが完全に表示
- ✅ Next.jsの画像最適化機能が正常動作
- ✅ 静的アセットのキャッシュ効果により高速化
- ✅ マネージドポリシーにより設定の信頼性向上

実際に修正後のサイトを確認したときは、本当に嬉しかったです！🎉

## まとめ 🎯

今回のCloudFront + Next.js画像最適化エラーの解決を通じて、以下の重要なポイントが明確になりました：

### ✅ 解決のキーポイント

1. `AllViewerExceptHostHeader`**ポリシーの導入** - Host Header問題の根本解決
2. **適切なキャッシュポリシーの使い分け** - パフォーマンスと機能性の両立
3. **段階的なデバッグアプローチ** - 問題の本質的な理解

### ✅ 技術的成果

- CloudFront経由でNext.jsの画像最適化機能が完全動作
- マネージドポリシー活用による設定の簡潔化と信頼性向上
- パフォーマンス改善（静的アセットのキャッシュ効果）

### ✅ 今後の応用

- 他のNext.js + CDN構成での知見として活用可能
- App Runnerを使用する際のベストプラクティスとして適用
- AWSマネージドポリシーの効果的な活用例として参考

CloudFrontとNext.jsの組み合わせは、設定が複雑になりがちですが、適切なアプローチで確実に解決できることが実証できました。同じような問題で悩んでいる方の参考になれば幸いです！

もし他により良い方法や、追加の改善案があれば、ぜひ教えてください〜🙇‍♂️

**検証環境**: AWS App Runner + CloudFront + Next.js
**解決日**: 2025-06-21
**結果**: ✅ CloudFront経由での画像最適化機能完全動作

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺