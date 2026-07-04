---
name: write-article
description: Zenn記事の執筆ワークフロー。テーマ調査→構成合意→執筆→セルフチェックまで一貫して行う。新規記事の作成依頼で使用。
argument-hint: "[テーマ or memo.mdパス]"
---

Zenn記事を新規に執筆するワークフローです。時間をかけて丁寧に考えること(ultrathink)。docs/prompt.md の定型プロンプトを正式な手順にしたものです。

正データは `docs/write-style.md`(文体)・`docs/zenn-rules.md`(Zenn記法・秘匿情報の扱い)・`docs/template.md`(frontmatter規則)にあります。このSKILL.mdには複製せず、都度Readで参照してください。

## 0. 入力確認

- `$ARGUMENTS` が与えられていればテーマ・メモとして使う
- 与えられていなければリポジトリルートの `memo.md` を探す
- どちらも無ければユーザーにテーマを確認し、確認が取れるまで先に進まない

## 1. 調査

`topic-researcher` サブエージェントに調査を委譲する。返却物として要点メモ・検証済み事実+出典・**参考URL一覧**を必ず受け取ること(参考URL一覧は手順4の剽窃チェックと記事の「参考資料」セクションの入力になるため、必ず保持する)。

`memo.md` に検証済みの技術情報と参考URLが十分揃っている場合は、調査を省略するか不足分だけの差分調査に縮小してよい。

## 2. 構成設計(あなた自身が行う)

`docs/write-style.md` の見出しパターン(📌絵文字、はじめに→概要→実装→注意点→まとめの順)で骨子を作成し、ユーザーに提示して合意を取る。

構成は write-style.md のテンプレートを正とする。`docs/template.md` は frontmatterの規則(title/emoji/type/topics/published)の参照にとどめ、そのh1始まりの構成例はそのまま使わない(実際の公開記事はすべてwrite-style.mdの型に従っている)。

## 3. 執筆(あなた自身が行う)

以下を必ず守ること:

- `docs/write-style.md` に準拠する。**まとめで✅絵文字は使用しない**(`- **要点**: 説明` の形式で書く)
- 冒頭に `:::message` `この記事はAIとの共著です。` `:::` を入れ、その直後にあいさつの定型文を続ける
- frontmatter: title 40文字以内・emoji 1文字・topics 5個以内・**`published: false` で作成する**
- 秘匿情報(ID・パスワード等)はプレースホルダー化する(`docs/zenn-rules.md` の「秘匿すべき情報の扱い」参照)
- **調査結果の文章をそのまま写さない**。事実とURLだけを使い、文章は自分で書き下ろす(剽窃の上流対策)

## 4. セルフチェック

1. `npx textlint articles/<slug>.md` を実行し、指摘があれば修正する
2. `references/self-review-checklist.md` の項目と照合する
3. ユーザーに `/review-article` の実行を提案する(自動連鎖はしない)

`published: true` への変更はユーザーの明示的な指示があるときのみ行う。
