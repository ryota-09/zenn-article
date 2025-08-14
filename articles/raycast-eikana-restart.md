---
title: "【Raycast】「英かな」の再起動コマンドをラクに実行したい！カスタムスクリプトの設定方法"
emoji: "🔄"
type: "tech"
topics: ["raycast", "mac", "効率化", "ツール"]
published: true
---

Raycastのカスタムスクリプト機能を使って「英かな」アプリの再起動を一瞬で実行できる便利なコマンドを作成する方法を紹介します！

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

今回は **Raycastで「英かな」の再起動コマンドを作成する方法** を紹介していきます！

## 📌 背景・課題

Macで日本語入力を効率化するために「英かな」アプリを使っている方は多いと思います。しかし、以下のような事象が発生することがあります。

- 英かなが正常に動作しなくなる
- キーバインドが効かなくなる
- アプリの再起動が必要になる

「あれ？変換されないなー」と思うことも多々。
手動で「英かな」を再起動するのは面倒ですよね😅

作業をRaycastで自動化して、一瞬で実行できるようにしていきます！

## 📌 前提条件

:::message
以下の環境が必要です。

| 項目 | バージョン・要件 |
|------|-----------------|
| macOS | macOS 10.15以降 |
| Raycast | v1.0以降 |
| 英かな | インストール済み |
| ターミナル | 基本的な操作ができること |

:::

## 📌 実装方法

### 1. スクリプトファイルの作成

まず、Documentsフォルダにスクリプトファイルを作成します。

**任意のファイル名**: `restart-eikana.sh`  
**保存場所**: `~/Documents/restart-eikana.sh`

```bash:restart-eikana.sh
#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Restart Eikana
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔄
# @raycast.description 英かなの再起動

killall '⌘英かな' && sleep 1 && open -a '⌘英かな'
```

**ポイントは以下の通りです：**
- `@raycast.*` コメントはRaycastが認識するメタデータ
- `killall '⌘英かな'` で実行中のプロセスを終了
- `sleep 1` で1秒待機してから再起動
- `open -a '⌘英かな'` でアプリを再起動

アプリ名が正確に`⌘英かな`になっているか確認も忘れずに！

### 2. 実行権限の設定

ターミナルで以下のコマンドを実行して、スクリプトファイルに実行権限を付与します：

```bash
chmod +x ~/Documents/restart-eikana.sh
```

### 3. Raycastの設定

**1. Raycastの設定を開く**
- `⌘ + ,` でRaycastの設定を開きます

**2. Scripts設定の確認**
- **Extensions** タブをクリック
- **Scripts** タブを選択
- 右側の **Script Directories** セクションを確認

**3. Documentsフォルダの追加**
- Documentsフォルダが追加されていない場合は「**Add Directories**」ボタンをクリック
- `~/Documents` を追加します

![](https://storage.googleapis.com/zenn-user-upload/f393f7c9ad84-20250814.png)
*Script Directoriesの設定画面*

### 4. 動作確認

Raycastを開いて「Restart Eikana」と入力すると、作成したコマンドが表示されます。

実行すると：
1. 現在実行中の「⌘英かな」プロセスを終了
2. 1秒待機
3. 「⌘英かな」アプリを再起動

## 📌 トラブルシューティング

### よくある問題と解決方法

**問題1: スクリプトが表示されない**
- Documentsフォルダが正しく設定されているか確認
- スクリプトファイルに実行権限があるか確認
- Raycastを再起動してみる

**問題2: 「英かな」が見つからないエラー**
- アプリ名が正確に`⌘英かな`になっているか確認
- アプリがインストールされているか確認

**問題3: 権限エラー**
```bash
# 実行権限を再度設定
chmod +x ~/Documents/restart-eikana.sh
```

同じように「英かな」の不具合で困っている方や、Raycastでの作業効率化を検討している方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

https://x.com/Ryo54388667/status/1930424791884046414

