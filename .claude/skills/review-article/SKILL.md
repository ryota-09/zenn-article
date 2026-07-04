---
name: review-article
description: 公開前の総合レビュー。機械チェック(textlint・frontmatter・秘匿情報)と文体・剽窃・ファクトチェックを並列実行し統合レポートを出す。記事の公開・レビュー依頼で使用。
argument-hint: "[記事ファイルパス]"
---

公開前の記事を、機械チェックと3つのサブエージェントによるレビューを組み合わせて総合判定するワークフローです。

## 0. 対象特定

引数が無ければ `articles/` の中で最も最近更新されたmdファイルを候補としてユーザーに確認する。

## 1. 機械チェック(直列・軽量)

以下を順に実行し、指摘を一覧化する(この段階では `--fix` しない):

```
node .claude/scripts/check-frontmatter.mjs <file>
node .claude/scripts/scan-secrets.mjs <file>
npx textlint <file>
```

textlintの指摘のうち、`Disallow to use "!"` が画像記法(`![](url =幅x)` のようなリサイズ指定付き)の行から出ている場合は、Zenn独自の画像幅指定構文をtextlintのMarkdownパーサーが認識できないことによる既知の誤検知なので無視してよい。

## 2. エージェントレビュー(並列)

`style-reviewer` ・ `plagiarism-checker` ・ `fact-checker` を**1メッセージで同時に起動する**(並列実行のため)。

- `plagiarism-checker` には記事パス+参考URL(記事内の参考資料セクション、および会話の文脈にあるURL)を渡す

## 3. 統合判定(あなた自身が行う)

3段階のレポートにまとめる:

- **[必須=公開ブロッカー]**: 秘匿情報の疑い / frontmatter不正 / 剽窃リスクの「レベルA」/ 明確な技術的誤り
- **[推奨]**: textlintの指摘 / 文体逸脱 / 確認不能な技術的主張
- **[任意]**: その他の改善提案

修正の適用はユーザーに確認してから行う。

## 4. 最終確認

- AI共著記事の場合、AI共著注記があるか確認する
- `published: true` への変更はユーザーの明示的な指示があるときのみ
- 仕上げとして、公開直前に CopyContentDetector での手動チェックを案内する(`.claude/skills/plagiarism-check/references/manual-check-guide.md` 参照)
