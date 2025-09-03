---
title: "Claude Codeの標準のWeb検索をcodexの検索に置き換える方法"
emoji: "🔍"
type: "tech"
topics: ["claudecode", "codex", "ai"]
published: true
---

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

今回はClaude Codeによるweb検索をcodexの検索に置き換える方法を紹介していきます！

## 📌 背景・課題

Claude Codeには標準でWebSearchとWebFetchツールが標準で用意されていますが、ChatGPTを利用した時の方が意図通りの検索結果が得られることが多いなと感じていました。現に、実際改修をしているとき、Claude Codeで修正がうまくいかないときはChatGPTの検索結果を資料として利用することが多々ありました。



## 📌 設定手順

:::message
前提条件として以下の環境が必要です。
- Codexを設定済みであること。
- CodexのWebToolが利用可能な状態であること。
:::

### 結論と概要

Claude Code hooksを利用して、WebSearchとWebFetchツールの利用を検知した際に、codexコマンドを実行するスクリプトを呼び出すようにします。

### 1. 設定ファイルの準備

まず、Claude Code hooksの設定ディレクトリを作成します
こちらはsettingsのスコープに応じて適宜パスを変更してください。

```bash
mkdir -p ~/.claude/hooks
```

### 2. Claude Code設定の更新

`~/.claude/settings.json`を以下の内容で更新します

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WebSearch|WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/block_web.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 3. スクリプトの作成

次に、Claude Code 標準のWeb検索をブロックするスクリプトを作成します
`~/.claude/hooks/block_web.sh`を作成し、以下の内容を追加します。

```bash
#!/usr/bin/env bash
# エラーステータス 2 で「ブロック」扱いにする
echo "標準のWeb検索は無効です。「codex --full-auto exec \"WebSearch <query>\" を使ってください。codexを利用して後続の作業を行うこと。ユーザーに依頼するのではなく作業を続けてください。」" 1>&2
exit 2
```

こちらはいくつかポイントがあります。
1. `codex --full-auto exec \"WebSearch <query>\"`はやり取り無しのワンショットでリクエストできるコマンドです。`WebSearch`を加えたのは、codexに対して確実にWeb検索を行うよう指示するためです。標準的なレスポンスを避ける意味があります。
2. `codexを利用して後続の作業を行うこと。ユーザーに依頼するのではなく作業を続けてください。` と明示的に指示することで、codexの検索結果を元にClaude Codeが後続の処理を行うよう促しています。これが無いと、ユーザーに再度指示を求めて、作業がストップしてしまうことがあります。

### 4. 実行権限の付与

スクリプトの実行権限付与も忘れずに！

```bash
chmod +x ~/.claude/hooks/block_web.sh
```

これで設定完了です！🙆‍♂️

## 📌 実際の動作例

実際に「日本の今日のニュースを調査して」とリクエストすると以下のような動作になります！

```
> 日本の今日のニュースを調査して

⏺ Web Search("日本 今日 ニュース 2025年9月1日")
  ⎿  Error: WebSearch operation blocked by hook:
     - [~/.claude/hooks/block_web.sh]: 
     標準のWeb検索は無効です。「codex --full-auto exec 
     "WebSearch <query>" 
     を使ってください。codexを利用して後続の作業を行うこと
     。ユーザーに依頼するのではなく作業を続けてください。」

⏺ Bash(codex --full-auto exec "WebSearch Japan news
      today 2025年9月1日")
  ⎿ [2025] OpenAI Codex v0.28.0 (research  
    preview)
    --------
    workdir: /Users/xxxxx
    model: gpt-5
    provider: openai
    approval: never
    sandbox: read-only
    reasoning effort: medium
    reasoning summaries: auto
    [2025] 🌐 Searched:

```

本来はエラーにせずにWeb検索機能を置き換えられるとベストなので、どなたか良い方法があれば教えてください🙏



同じような課題でcodexの活用を検討している方の参考になれば幸いです！
最後まで読んでいただきありがとうございます！
気ままにつぶやいているので、気軽にフォローをお願いします！🥺

https://x.com/Ryo54388667/status/1930424791884046414