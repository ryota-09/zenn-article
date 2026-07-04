---
name: style-check
description: 記事の文体チェック。textlint実行とdocs/write-style.mdとの照合を行い修正案を提示する。文体・表記の確認依頼で使用。
argument-hint: "[記事ファイルパス]"
---

記事の文体だけを素早くチェックしたいときのワークフローです。`/review-article` の一部を単体で回したいとき(執筆中に何度も繰り返したいとき)に使います。

## 手順

1. 対象記事を特定する(引数が無ければユーザーに確認)
2. `npx textlint <file>` を実行する。ただし、Zennの画像リサイズ記法(`![](url =300x)`)の行から出る `Disallow to use "!"` はtextlintのMarkdownパーサーの既知の誤検知なので無視してよい
3. `style-reviewer` サブエージェントを起動し、`docs/write-style.md` との照合結果を得る
4. 手順2・3の結果をあなた自身が統合し、以下の3分類で提示する:
   - **機械修正可**: `textlint --fix` で直せるもの
   - **文言修正が必要**: 手作業での書き換えが要るもの
   - **ガイド解釈が必要**: style-reviewerが「判断が必要」とした点
5. ユーザーと合意の上で修正を適用し、`npx textlint <file>` を再実行してクリーンになったことを確認する
