# Zenn技術記事リポジトリ

このリポジトリは、Zennで公開する技術記事と本を管理するためのものです。

## 📝 概要

Zenn CLIを使用して、技術記事と本をローカルで執筆・管理しています。Markdownで書いたコンテンツをGitで管理し、GitHubとZennを連携させることで記事の公開・更新を行います。

## 🚀 はじめに

### 前提条件

- Node.js（14.0.0以上）
- npm または yarn
- Gitの基本的な知識

### セットアップ

1. リポジトリのクローン
```bash
git clone [repository-url]
cd zenn-article
```

2. 依存関係のインストール
```bash
npm install
```

3. プレビューサーバーの起動
```bash
npx zenn preview
```
プレビューサーバーは http://localhost:8000 で起動します。

## 📚 使い方

### 新しい記事の作成
```bash
npx zenn new:article
```

### 新しい本の作成
```bash
npx zenn new:book
```

### コンテンツの一覧表示
```bash
# 記事一覧
npx zenn list:articles

# 本一覧
npx zenn list:books
```

## 📁 プロジェクト構造

```
zenn-article/
├── articles/          # 記事を格納するディレクトリ
│   └── *.md          # 各記事のMarkdownファイル
├── books/            # 本を格納するディレクトリ
│   └── book-slug/    # 本ごとのディレクトリ
│       ├── config.yaml  # 本の設定ファイル
│       └── *.md        # 各章のMarkdownファイル
├── docs/             # ドキュメント類
│   ├── template.md   # 記事テンプレート
│   ├── write-style.md # 執筆スタイルガイド
│   └── zenn-rules.md  # ZennのMarkdown記法
├── images/           # 画像ファイル
├── package.json      # Node.jsプロジェクト設定
└── CLAUDE.md         # AIアシスタント用の指示書
```

## ✍️ 執筆ガイドライン

### 記事のフロントマター

```yaml
---
title: "記事のタイトル"
emoji: "😊"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "nextjs", "typescript"]
published: false # 公開設定
---
```

### 執筆スタイル

- フレンドリーな自己紹介から始める
- 読者の課題を共有してモチベーションを語る
- カジュアルな言い回しを使用（「スーっと」「ポンっと」など）
- 技術用語は英語原文＋カタカナで表記
- 詳細は `docs/write-style.md` を参照

### 記事の基本構成

1. **はじめに** - 記事の概要と目的
2. **対象読者** - 誰向けの記事か
3. **前提知識** - 必要な知識レベル
4. **本文** - メインコンテンツ
   - 背景・課題
   - 解決方法
   - 実装例
5. **まとめ** - 要点の整理

## 🔧 開発Tips

### Zenn CLIのアップデート
```bash
npm update zenn-cli
```

### 画像の配置
- `images/`ディレクトリに画像を配置
- 記事内では相対パスで参照: `![alt](/images/sample.png)`

## 📖 参考リンク

- [Zenn CLIの使い方](https://zenn.dev/zenn/articles/zenn-cli-guide)
- [ZennのMarkdown記法](https://zenn.dev/zenn/articles/markdown-guide)
- [GitHubリポジトリ連携](https://zenn.dev/zenn/articles/connect-to-github)

## 📄 ライセンス

記事の著作権は著者に帰属します。特に明記がない限り、コードサンプルはMITライセンスで提供されます。