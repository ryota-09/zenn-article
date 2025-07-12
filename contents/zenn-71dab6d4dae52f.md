---
title: "🏗️ WordPressからmicroCMSへ移行してブログをフルリニューアルした話"
emoji: "🏗️"
type: "tech"
topics: ["WordPress", "microCMS", "Next.js", "ブログ移行"]
published: true
created_at: "2024-06-23T00:00:00.000Z"
published_at: "2024-06-23T00:00:00.000Z"
---

# WordPressからmicroCMSへ移行してブログをフルリニューアルした話

## 📌 はじめに

こんにちは！[@Ryo54388667](https://twitter.com/Ryo54388667)です!☺️

普段は都内でエンジニアとして業務をしてます。主にTypeScriptやNext.jsといった技術を触っています。

数年前に作成したWordPressのブログを、次の本業プロジェクトでのSEO知見を活かすため、ヘッドレスCMSに移行することにしました。

## 📌 アプリケーション

**技術スタック**:
- Next.js (App Router)
- TailwindCSS
- microCMS
- TypeScript

### 主な実装ポイント

#### 1. richEditorのparser

- `html-react-parser`を利用
- microCMSからsanitize済みのHTMLを取得
- カスタムコンポーネントへの変換処理を実装

```typescript
import parse from 'html-react-parser';

const parsedContent = parse(content, {
  replace: (domNode) => {
    // カスタムコンポーネントへの変換ロジック
    if (domNode.type === 'tag' && domNode.name === 'pre') {
      return <CustomCodeBlock {...domNode.attribs} />;
    }
  }
});
```

#### 2. レスポンスデータの型定義

- ZOZOの技術ブログを参考に実装
- 繰り返しフィールドやカスタムフィールドの型補完を実現

```typescript
// microCMSのレスポンス型定義
interface BlogPost {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  category: Category;
  tags?: Tag[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
}
```

#### 3. ブログ詳細ページ

- ビルド時にプリレンダリング
- ECRでの環境変数設定に注意
- generateStaticParamsを使用した動的ルーティング

```typescript
export async function generateStaticParams() {
  const posts = await getMicroCMSPosts();
  return posts.map(post => ({
    slug: post.id
  }));
}
```

#### 4. Zenn記事の取得

- RSSフィードからデータを取得し、一覧ページを作成
- 外部APIとの連携でキャッシュ戦略を実装

#### 5. その他の工夫

- **シンタックスハイライト**: バンドルサイズ最適化のため動的ロード
- **アクセシビリティ**: WAI-ARIAに準拠したマークアップ
- **URLの折り返し対応**: 長いURLの表示最適化
- **画像ドメインのリソースヒント**: パフォーマンス向上のためのプリロード設定

## 📌 インフラ

**技術スタック**:
- Terraform
- AWS App Runner
- CloudFront
- Route 53

### インフラ構成の特徴

#### AWS App Runnerの採用理由

1. **シンプルなデプロイ**: GitHubとの連携が簡単
2. **自動スケーリング**: トラフィックに応じた自動調整
3. **コストパフォーマンス**: 小規模ブログに適した料金体系

#### CloudFrontの設定

- 静的アセットのキャッシュ最適化
- OG画像の配信最適化
- セキュリティヘッダーの設定

```hcl
# Terraform設定例
resource "aws_cloudfront_distribution" "blog" {
  origin {
    domain_name = aws_apprunner_service.blog.service_url
    origin_id   = "app-runner-origin"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  default_cache_behavior {
    target_origin_id = "app-runner-origin"
    # キャッシュ設定...
  }
}
```

## 📌 移行作業で学んだこと

### microCMSの利点

1. **開発者体験の良さ**: 直感的なUI、豊富なAPI
2. **コンテンツの管理しやすさ**: 非エンジニアでも扱いやすい
3. **パフォーマンス**: CDN配信による高速レスポンス

### 課題と解決策

#### 画像の最適化

WordPressからの移行で画像サイズが課題となりましたが、以下で解決：

- microCMSの画像変換API活用
- Next.js Imageコンポーネントでの最適化
- WebP形式への自動変換

#### SEOの維持

- URL構造の維持
- メタデータの適切な設定
- 構造化データの実装

```typescript
// 構造化データの実装例
const structuredData = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": post.title,
  "author": {
    "@type": "Person",
    "name": "Ryota"
  },
  "datePublished": post.publishedAt,
  "dateModified": post.updatedAt,
};
```

## 📌 パフォーマンス改善結果

### 移行前（WordPress）
- **LCP**: 3.2s
- **FID**: 120ms
- **CLS**: 0.15

### 移行後（Next.js + microCMS）
- **LCP**: 1.8s
- **FID**: 45ms
- **CLS**: 0.05

約40%のパフォーマンス向上を実現しました。

## 📌 今後の展望

### 追加予定の機能

1. **全文検索**: Algoliaの導入検討
2. **コメント機能**: サーバーレス関数での実装
3. **購読機能**: RSS以外の通知システム
4. **多言語対応**: i18n対応の実装

### 継続的改善

- Core Web Vitalsの継続監視
- コンテンツの充実
- ユーザー体験の向上

## 📝 まとめ

WordPressからmicroCMSへの移行により：

✅ **開発効率の向上**: モダンな技術スタックによる開発体験改善
✅ **パフォーマンス向上**: 約40%の読み込み速度改善
✅ **運用コスト削減**: サーバー管理不要でメンテナンス負荷軽減
✅ **セキュリティ向上**: ヘッドレス構成によるセキュリティリスク軽減

移行作業は大変でしたが、結果として満足のいくブログリニューアルができました。
特に、microCMSの開発者体験の良さとNext.jsの柔軟性を活かせたのが良かったです。

同じような移行を検討している方の参考になれば幸いです！