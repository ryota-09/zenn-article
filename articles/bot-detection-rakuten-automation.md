---
title: "クレカの利用履歴を通知する仕組みを作ろうとしたけどBot対策にブロックされた話"
emoji: "💬"
type: "tech"
topics: ["playwright", "scraping", "githubactions", "家計", "automation"]
published: true
---

:::message
この記事はAIとの共著です。
:::

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！最近はプロジェクトをインフラからバックエンド、フロントエンドまで一通り任せてもらっています。

今回は個人開発で楽天カードの利用履歴をLINEに自動通知する仕組みを作る過程で、**3つの壁にぶつかって設計を作り直し続けた話** を紹介していきます！

「メールの解析で終わり」「クラウドの cron に乗せれば終わり」と高をくくっていた自分が、**データソースの壁 → サンドボックスの壁 → サイトの Bot 対策の壁** という3つの壁に順に阻まれ、**GAS → Claude Code Routines → GitHub Actions(※GitHub が提供する CI/CD サービス) → ローカル PC の launchd(※macOS 標準のスケジューラ・プロセスマネージャ。cron + init + systemd 相当)** と作り直す羽目になった実録です。途中からの主役は、サイト側の Bot 対策（Bot Manager ※サイトに到達するリクエストを Bot か否か判定する CDN / WAF 系サービスの総称）です。楽天さんが非常に頑強にセキュリティ対策をしていることは今回わかったので感謝もあります😎

## 📌 TL;DR

- **第一の壁（データソース）**: GAS で楽天の利用通知メールを文字列パースしていたが、**継続課金（公共料金・サブスク）はメール対象外**で家計の実態が見えなかった → 楽天 e-NAVI(※楽天カードの会員向け Web サービス) から Playwright(※Microsoft 製のブラウザ自動化ライブラリ。Selenium の後継的存在) で CSV 取得する方式に切り替え
- **第二の壁（Claude Code Routines）**: サンドボックスが HTTPS の `CONNECT` メソッド(※HTTPS をプロキシ越しに通すためのトンネリング用 HTTP メソッド) に対応しておらず、headless ブラウザ(※画面表示なしで動くブラウザモード。サーバ上での自動化に使う) が外部に出られない
- **第三の壁（GitHub Actions hosted runner）**: Microsoft Azure データセンタの IP がサイト側の Bot 対策に Bot 認定されており、CSV ダウンロード URL だけ soft-block(※明示的に拒否(403)せず、200 OK で別ページを返す Bot 対策) 画面（200 OK だが中身は「アクセスが集中しています」）が返る
- 最終的にローカルマシンで実行するような方針に変更した。macOS の `launchd` を使い、自宅 Mac から実行する方式に切り替えてようやく安定運用に到達
- 一番の学び: 楽天さんのbot対策は頑強💪

## 📌 何を作ろうとしたか

### 家計の見える化

我が家の家計管理は楽天カードに集約していて、毎月「いくら使ったか」を私（本人カード）と家族（家族カード）の両方に月中（15日）と月末にLINEで通知することを考案しました。

月2回LINE通知だけならシンプルなはずだったのですが、ここから3つの壁にぶつかっていきます。最初の壁は「**データの欠如**」、続く2つは「**どこで動かすか**」でした。順番に見ていきます。

最終的に作成したものはこれです。LINEの画面。

![](https://static.zenn.studio/user-upload/6c52aeec5359-20260506.jpg =300x)

## 📌 第一の壁: 利用通知メールでは公共料金などの継続課金のものが通知されない

### 方針

最初の仕組みはGoogle Apps Script (GAS)ベースで、楽天カードから届く利用通知メールを文字列パースしていました。GAS は無料で動かせて、Gmail / Sheets と相性が良く、家計周りの個人開発では定番の選択肢です。

「利用通知メールが来るたびに金額を抜き出して Sheets に追記して、月2回まとめて LINE 通知する」 一見シンプルなパイプラインで、ひとまず動いてはいました。

### 詰んだ瞬間: そもそもメールに来ない明細がある😇

致命的な穴に気づいたのは、ある月の通知金額が「明らかに少なすぎる」と感じた時でした。

| 取得できたもの               | 取得できなかったもの                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| ネットショッピング、店舗利用 | **公共料金（電気・ガス・水道）**、NHK受信料、携帯料金、Netflix 等のサブスク |

楽天カードは「利用通知メール」を**すべての利用に対して送ってくれるわけではなく**、**継続課金（公共料金やサブスク）はメール対象外**でした。。。これらは月々10万円近くになることもあって、家計の実態がまったく見えなくなっていました😅個人的には全ての支出を明らかにしたかったので無視できませんでした。こちらを許容するなら、GASの仕組みで完結すると思います。

### 方針変更: 楽天e-NAVI画面 スクレイピングへ

公開 API があれば話は早いのですが、楽天カードには公開 API がありません。(※楽天さんお願いします。。)楽天 e-NAVI の「ご利用明細」ページから CSV をダウンロードして解析する一択でした。e-NAVI に手動でログインすれば、こんな CSV がボタン1つでダウンロードできます。

```csv
"利用日","利用店名・商品名","利用者","支払方法","利用金額"  ← 以下、合計11列
"2026/04/30","スギ薬局","本人","1回払い","1285",...
"2026/04/28","東京電力","本人","1回払い","8421",...
```

CSV さえ手に入れば、あとは

- 解析 → Google スプレッドシート へ追記（gspread(※Python から Google Sheets API を直接呼び出すライブラリ) で API 直叩き）
- LINE Messaging API(※LINE 公式アカウントから個人へ Push 等が送れる API。月200通まで無料) の Push API で本人と家族の個人トークにメッセージを送る
- LINE のコミュニケーションプランは月200通まで無料。

この時点では、「Playwright で headless ブラウザを動かして、月2回どこかでスケジュール実行するだけだろう。クラウドの cron 的なやつに乗せて終わりだ！」と思っていたのですが。。。

この甘い見通しが、ここから2つの壁が立ちはだかることになります。

## 📌 第二の壁: Claude Code Routines

### 方針

最初に飛びついたのは Claude Code Routines（Anthropic が提供する、Claude Code の実行をクラウドでスケジュール化する機能）でした。最近ローンチされたものですし、一回触っておきたいなーという気持ちもありました。

魅力はこんな感じです。

- スケジューラ組み込み済み（cron 相当のことができる）
- 「PC を起動しておく必要すらない」
- 楽天側のUIの変更にも柔軟に対応できそう！これが結構良い気がしていた。当初は。。。


### 詰んだ瞬間: HTTPS CONNECT 非対応

Routines のサンドボックスで Playwright headless を起動した瞬間、chromium が即落ちしました。最初は「Chromium のインストールが壊れている？」「ライブラリ依存が足りない？」と疑ったのですが、ログを確認するとHTTPS の `CONNECT` メソッド がブロックされていることが分かりました。

### Issue 調査でわかったこと: これは「自分の環境のせい」ではなかった

最初は「自分のセットアップが悪いのか」と疑って小一時間ハマりかけたのですが、関連 Issue を当たったら **既知の制約** として複数の場所で議論されていました。

- [anthropics/claude-code#11791](https://github.com/anthropics/claude-code/issues/11791) ── Claude Code 側で同種の事象が報告されている
- [microsoft/playwright#39934](https://github.com/microsoft/playwright/issues/39934) ── Playwright を制限付きサンドボックスで動かそうとして CONNECT が通らない挙動が議論されている

同じ仕組み（Chrome DevTools Protocol 経由で実ブラウザを操作する系）のPuppeteer / Selenium も同様に動かない、つまり `CONNECT` 経由の HTTPS トンネリングを必要とする「実ブラウザを動かす系」のライブラリは一律ダメ という状態。

## 📌 第三の壁: GitHub Actions

### 方針

Routines がダメなら GitHub Actions に方針を変更しました。

| 要素           | 採用したもの                                        |
| -------------- | --------------------------------------------------- |
| ランナー       | GitHub-hosted Ubuntu runner                         |
| ブラウザ自動化 | Playwright Python (chromium headless)               |
| スケジュール   | `schedule:` cron（15日 と 27〜30日 の毎日）         |
| 認証情報       | GitHub Secrets（楽天 / LINE / Google / Gmail） |
| エラー通知     | 失敗時に Gmail SMTP でメール                        |

実装は淡々と進みました。ローカル開発では完璧に動いた。

```bash
$ python -m money_usage_notification.run --mode mid-month
[INFO] run: === 起動 mode=mid-month ===
[INFO] scraper: ログインセッション有効
[INFO] scraper: CSV ダウンロード成功 (3,989 bytes)
[INFO] csv_parser: 30件パース / 本人 ¥xxxxx / 家族 ¥xxxxx / 合計 ¥xxxxx
[INFO] sheets_updater: 30件追加 / 月次サマリー更新
[INFO] line_notifier: OWNER Push 200 / MEMBER Push 200
[INFO] run: 通知済フラグ更新 mid-month=TRUE
[INFO] run: === 完了 (29.7s) ===
```

E2E テストが30秒で完走。全ステップが緑。LINE には Message が届き、スプレッドシートには30件の明細と月次サマリーが書き込まれました。**勝ちを確信しました**。

あとは GHA のワークフローファイルに転記して `gh workflow run` を叩くだけ、と。

### 詰んだ瞬間のログ

```bash
$ gh workflow run rakuten-mid-month.yml --repo {user-repo}/money-usage-notification
✓ Created workflow_dispatch event for rakuten-mid-month.yml
$ gh run watch
```

Actions UI のログを見ながらコーヒーを淹れていたら、こうなりました。

```
[INFO] run: === 起動 mode=mid-month ===
[INFO] run: [2/6] e-NAVI から CSV ダウンロード
[INFO] scraper: ログインセッション有効: https://www.rakuten-card.co.jp/e-navi/members/index.xhtml
                                                                        ↑ ここまでは到達
[ERROR] playwright._impl._errors.TimeoutError:
        Timeout 45000ms exceeded while waiting for event "download"
```

最初の感想:

> 「ダウンロードが遅いだけだろう。タイムアウトを 45秒 → 90秒 にすればいい」

これが**最初の間違い**でした。

#### タイムアウト延長で粘った3時間

`timeout=45000` を `timeout=90000` に変更してコミット、push、再実行。

```
[ERROR] playwright._impl._errors.TimeoutError:
        Timeout 90000ms exceeded while waiting for event "download"
```

90秒、待った末に同じエラー。今度は `timeout=180000` に。

```
[ERROR] playwright._impl._errors.TimeoutError:
        Timeout 180000ms exceeded while waiting for event "download"
```

3分待ったあげくの同じエラー。ここでようやく「これは時間の問題ではない」と気づきました。

ここまでで約3時間が消えていました。。。`gh run watch` でログをぼーっと眺める時間と、コミット/push/再実行のサイクル、Actions UI のキューイング遅延などで、1イテレーションが10〜15分かかります。これを6回繰り返すとあっという間に時間が溶けます。。😅

#### スクショにエラーページが写っていた

例外時の挙動として、scraper.py には例外発生時にスクリーンショットを保存する処理を仕込んでいました。

```python
async def fetch_csv(...):
    try:
        # ... ブラウザ操作 ...
        async with page.expect_download(timeout=45000) as download_info:
            await page.evaluate(
                "window.location.href = '/e-navi/members/statement/index.xhtml?downloadAsCsv=1'"
            )
        download = await download_info.value
        await download.save_as("secrets/rakuten.csv")
    except Exception:
        # 失敗時のスクリーンショットを残す
        await page.screenshot(path="secrets/error.png", full_page=True)
        raise
```

これを GitHub Actions の `actions/upload-artifact` で保存しておけば、ジョブ失敗時にも後から拾えます。

```yaml
- name: Upload error artifacts on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: error-artifacts
    path: secrets/error.png
```

スクショを開いてみると、

> **「アクセスが集中し、ページを閲覧しにくい状態になっております」**
>
> Reference #0.xxxxxxxx.yyyyyyyyyy.zzzzzzzz

おそらくBot判定されているようでした。


:::message
Bot Manager は明示的に拒否（403）よりも、正常風のレスポンスを返してこちらを混乱させていそう。これは真似したい対策👏
:::

#### 何をやってもブロックされる

ここから「Bot 検知突破」のお決まりの対策が始まりました。前述した検知層 L2〜L6 を片っ端から潰していきます。

:::details Bot 対策フル装備の Playwright 起動コード（例）

```python
# Bot 対策フル装備の Playwright 起動コード
browser = playwright.chromium.launch(
    headless=True,
    args=[
        "--disable-blink-features=AutomationControlled",  # navigator.webdriver = false
        "--no-sandbox",
        "--disable-dev-shm-usage",
    ],
)
context = browser.new_context(
    user_agent=(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    ),
    locale="ja-JP",
    timezone_id="Asia/Tokyo",
    viewport={"width": 1280, "height": 720},
    storage_state=storage_state_path,  # 永続Cookie 込みのセッション
    extra_http_headers={
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
)
```

:::

入れた対策のチェックリスト:

- L4: `navigator.webdriver = false` 化（`--disable-blink-features=AutomationControlled`）
- L3: User-Agent を実 Chrome 147 Mac 版の正確な文字列に
- L3: Accept-Language を `ja,en-US;q=0.9,en;q=0.8` に
- L3-L4: locale=ja-JP / timezone=Asia/Tokyo / viewport=1280x720（人間の Mac の設定相当）
- L6: 信頼済みデバイス登録済みの永続 Cookie 込み storageState(※Playwright のセッション情報(Cookie + localStorage)を JSON で保存・復元する仕組み) を復元
- L4: `Stealth` 系の設定を可能な範囲で適用

これら全部入れた状態で同じ症状。**何ひとつ変わらなかった**んですね。

最後の悪あがきとして、HTTP 直叩きで TLS 指紋(※TLS ハンドシェイクの内容(暗号スイート、拡張、楕円曲線)から計算される指紋。クライアント特定に使われる。代表例は JA3)（L2）を Chrome に偽装する [`curl_cffi`](https://github.com/yifeikong/curl_cffi) も試しました。

```python
from curl_cffi import requests

# Chrome 110 の TLS fingerprint を偽装してリクエスト
r = requests.get(
    "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?downloadAsCsv=1",
    impersonate="chrome110",
    cookies=cookies_dict,
)
```

→ こちらは更にひどく、ログインページにリダイレクトされて即敗北。HTTP 直叩きはブラウザレベルの JS 実行が走らないので、Bot Manager の Cookie 検証（L6）でアウトでした。

詰み。

#### 「IP レピュテーションだ」と気づくまで

ここで、初めて意味のあるデバッグをしました。なお **IP レピュテーション**(※IP アドレスの「信用スコア」。家庭用 ISP は高め、データセンタは低め) という言葉は後ほど詳しく扱いますが、ざっくり「接続元 IP に対して Bot Manager が付けている信用スコア」だと思ってください。

> **同じコード・同じ storageState・同じ Python バージョンで、ローカル PC（自宅 ISP）から動かしてみる**

これは超基本のデバッグなのですが、「Bot Manager の対策をどうやって突破するか」に頭が支配されていて、**比較対象を作る**という発想に到達するのに半日かかりました。エンジニアあるあるの「対策の引き出しを順番に開けて全部試す」モードに入ると、原因の切り分けより対策の探索を優先してしまうんですよね😅

ローカル Mac でターミナルから:

```bash
$ python -m money_usage_notification.run --mode mid-month
[INFO] run: === 起動 mode=mid-month ===
[INFO] scraper: ログインセッション有効
[INFO] scraper: CSV ダウンロード成功 (3,989 bytes)
[INFO] csv_parser: 30件パース / 本人 ¥xxxx/ 家族 ¥xxxx / 合計 ¥xxxx
[INFO] sheets_updater: 30件追加 / 月次サマリー更新
[INFO] line_notifier: OWNER Push 200 / PARTNER Push 200
[INFO] run: 通知済フラグ更新 mid-month=TRUE
[INFO] run: === 完了 (29.7s) ===
```

E2E、全部通りました。

ローカルでは動く。GHA hosted runner では動かない。違うのは何か?

| 要素              | ローカル Mac           | GHA hosted runner                |
| ----------------- | ---------------------- | -------------------------------- |
| Python バージョン | 3.13.5                 | 3.13.5                           |
| Playwright        | 1.59.0                 | 1.59.0                           |
| ブラウザ          | chromium 147           | chromium 147                     |
| storageState      | 同一                   | 同一（Secret 経由）              |
| User-Agent        | 同一                   | 同一                             |
| 環境変数          | 同一                   | 同一                             |
| **接続元 IP**     | **自宅 ISP（NTT 系）** | **Microsoft Azure データセンタ** |

**違うのは IP だけ**。これで原因がほぼ特定されました。

更に裏付けとして、`curl ifconfig.me` を GHA workflow に仕込んで実 IP を見ると、あっさり Azure の IP レンジが返ってきました。代表的な Bot Manager が、Azure / AWS / GCP の IP レンジを「データセンタ」カテゴリにまとめて Bot スコアを低く付けているのは、Bot Mitigation 業界では公然の事実だったみたいです（後から知った）。

| 観察事実                                                                                      | 推定原因                                                                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ローカル（自宅 ISP）では E2E 成功                                                             | 自宅 IP のレピュテーションが正常                                                   |
| GHA hosted runner では members までは200だが、CSV URL だけ soft-block                         | Azure IP レンジが Bot Manager 側で Bot 扱い                                        |
| UA / TLS fingerprint / `--disable-blink-features=AutomationControlled` を全部入れてもブロック | Bot Manager は IP レピュテーションを最優先で判定（L1 で弾かれると L2-L6 は無関係） |

UA も TLS 指紋も storageState も、L1 の判定には何の影響もない。対策のしようがない種類の壁でした。

## 📌 泣く泣くローカル実行する方針に変更

クラウドを諦めて、自宅の Mac の起動時(スリープから復帰時も含む)方針に切り替えました。前提として、自分がほぼ毎日PCを触る生活をしているので、PCを1日1回触る運用であれば、実用上の取りこぼしはほぼゼロにできると考えました。

### launchd とは（cron との違い）

**launchd** は macOS 標準のスケジューラ・プロセスマネージャです。Linux でいう init + cron + systemd を1つにしたような存在で、Apple は OS X 10.4 (2005) 以降、cron や rc.d を非推奨にして launchd に統一しています。

cron と launchd の主な違い:

| 項目                        | cron                | launchd                                                |
| --------------------------- | ------------------- | ------------------------------------------------------ |
| 設定の単位                  | crontab（行ベース） | plist（XML）                                           |
| 発火条件                    | 時間ベースのみ      | 時間 + ログイン + ファイル監視 + ネットワーク監視 など |
| PC スリープ中の発火         | 完全にスキップ      | 復帰時に catch-up 発火（複数回逃しても1回に合体）      |
| PC 電源OFF からの起動時 | 過去の発火は消える  | `RunAtLoad: true` で起動直後に再発火させられる         |
| ログ管理                    | 自前                | `StandardOutPath` で標準出力の保存先を指定可能         |

役割を整理すると、**スリープ → 復帰** の取りこぼしは launchd 自身の `StartCalendarInterval` の catch-up が拾ってくれます（Apple の `launchd.plist(5)`(※Apple のプロパティリスト形式の XML 設定ファイル) man page 参照）。一方、電源OFF → 起動 をまたいだ取りこぼしは catch-up の範囲外なので、ここを `RunAtLoad: true` で「起動 / ログイン直後に1回発火」させて埋める、という設計です。冪等性(※何度実行しても結果が変わらない性質。リトライ可能な設計には必須) と組み合わせれば「PC を1日1回触る運用」で実用上の取りこぼしはほぼゼロにできます。

#### plist の最小例

実際に使っている plist（一部省略・簡略化）。

:::details plist の中身（例）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ryota.money-notification</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/.../.venv/bin/python</string>
        <string>scripts/scheduled_run.py</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/.../money-usage-notification</string>

    <!-- ログイン直後に1回発火 -->
    <key>RunAtLoad</key>
    <true/>

    <!-- 毎日 12:00 (ローカルTZ) に発火 -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>12</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/.../Library/Logs/money-notification.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/.../Library/Logs/money-notification.log</string>
</dict>
</plist>
```

:::

これを `~/Library/LaunchAgents/com.ryota.money-notification.plist` (※`~/Library/LaunchAgents/*.plist` に置いたものは LaunchAgent と呼ばれ、ユーザーログイン後に動く launchd ジョブとなる) に配置して、

```bash
$ launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.ryota.money-notification.plist
$ launchctl print gui/$UID/com.ryota.money-notification
$ launchctl kickstart gui/$UID/com.ryota.money-notification   # 即時テスト発火
```

これだけで「ログイン直後 + 毎日12時に Python を叩く」ジョブの完成です。

#### `scheduled_run.py` の冪等判定

launchd は `RunAtLoad: true` のせいで「ログインのたびに発火」してしまうので、1日に何度ログインしても多重通知しないように、**判定と冪等性**を担うラッパースクリプトを噛ませています。

```python:scripts/scheduled_run.py
# 疑似コード

import calendar
import datetime
import fcntl

JST = datetime.timezone(datetime.timedelta(hours=9))

def main():
    # 1) ロックを取る（同時起動防止）
    lock = open("/tmp/money-notification.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0  # 既に他のプロセスが走っている

    # 2) .env を環境変数に読み込み
    load_dotenv_inline(".env")

    # 3) スプレッドシートの「通知済フラグ」を取得
    today = datetime.datetime.now(JST).date()
    ym = today.strftime("%Y/%m")
    day = today.day
    last_day = calendar.monthrange(today.year, today.month)[1]

    sheets = SheetsUpdater()
    mid_done = sheets.is_already_notified(ym, "mid-month")
    end_done = sheets.is_already_notified(ym, "end-month")

    # 4) ケース判定
    # A: 月中通知（15日以降に未通知）
    if day >= 15 and not mid_done:
        return run_main(["--mode", "mid-month"])

    # B: 月末通知（月末日に未通知）
    if day == last_day and not end_done:
        return run_main(["--mode", "end-month"])

    # C: 月末リカバリ（翌月1〜5日に前月末分が未通知ならリカバリ）
    if day in (1, 2, 3, 4, 5):
        prev_ym = previous_year_month(today)
        if not sheets.is_already_notified(prev_ym, "end-month"):
            return run_main(["--mode", "end-month", "--ym-override", prev_ym])

    # D: 該当なし
    return 0
```

ポイントは以下の通り。

- **冪等性**: 通知済フラグが ON ならその ym/mode は二度と動かない。何度発火しても安全
- **失敗時の自動リトライ**: 失敗時はフラグが ON にならないため、次の launchd 発火（最短で次のログイン or 翌日12時）で自動再試行される
- **リカバリ窓**: PC が月末日にオフだったケースを、翌月1〜5日のログインで救う
- **ロック**: `flock` で多重実行を防ぐ。`RunAtLoad` と `StartCalendarInterval` が同時刻にならない限り並走はしないが、保険として

### ローカル実行のアーキテクチャ図

```
[macOS のログインユーザ]
   ↓
launchd LaunchAgent
   - RunAtLoad: true                          ← ログイン直後に1回発火
   - StartCalendarInterval: Hour=12, Minute=0 ← 毎日 12:00 JST に発火
   ↓
scripts/scheduled_run.py（薄いラッパー）
   - flock で重複実行防止
   - .env をロード
   - 通知済フラグから 4ケース判定
   ↓ (該当ケースのみ)
python -m money_usage_notification.run --mode {mode}
   ↓
[1] scraper.py  ─ Playwright headless で e-NAVI ログイン状態確認
                  └ 切れていたら新統合ログイン (Step1 ID → Step2 PW → 第2PW) で自動再ログイン
                  └ 「ご利用明細」→ CSV ダウンロード
[2] csv_parser ─ UTF-8 BOM CSV を 11 列でパース、補足行スキップ、ハッシュ計算
[3] sheets_updater ─ gspread で Sheets に重複排除しつつ append、月次サマリー upsert
[4] line_notifier ─ Flex Message (※LINE のリッチメッセージ形式。bubble / carousel 構造でレイアウト可能) を 本人 / 妻 の userId に Push
[5] 通知済フラグ更新 ─ 全成功時のみ ON

エラー時 → error_notifier 経由で ADMIN_EMAIL に Gmail SMTP 通知
```

#### ローカル実行で動作確認

```bash
# launchd に登録
$ launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.ryota.money-notification.plist
$ launchctl print gui/$UID/com.ryota.money-notification | grep state
        state = waiting

# 即時テスト発火
$ launchctl kickstart gui/$UID/com.ryota.money-notification

# ログ確認
$ tail -f ~/Library/Logs/money-notification.log
[INFO] scheduled_run: lock acquired
[INFO] scheduled_run: env loaded (24 keys)
[INFO] scheduled_run: ym=2026/05 mid_done=True end_done=False day=3 last_day=31
[INFO] scheduled_run: 該当条件なし → exit 0
```


## 📌 まとめ

家庭の家計通知システム1本のために、3度の設計やり直しと延べ20時間以上の試行錯誤を経て、最終的に到達したのは「Mac の launchd で1日1回 Python を叩く」という10年前から存在していた解でした。

本記事の要点は以下の通りです。

- **Bot 検知は IP レピュテーション（L1）が第一**: UA や TLS 指紋（L2-L4）の対策はその先の話で、IP で弾かれていたら何をしても通らない
- **Bot Manager の soft-block は 200 OK で返る**: ステータスコードを見て安心してはダメ。`page.title()` や `page.content()` の中身まで確認する
- **`expect_download` の TimeoutError は何も語らない**: 例外時に screenshot / URL / title / HTML フルダンプを保存する習慣を仕込んでおく
- **本番とローカルの差分は IP まで詰める**: 差分が「IP のみ」になっていれば、原因の特定は半日で終わる
- **「とりあえずクラウド」を疑う**: 個人開発の月数回発火なら、自宅 Mac の `launchd` で十分すぎる
- **launchd は冪等性とセットで設計**: `RunAtLoad: true` の多重発火は、データストアの「通知済フラグ」で吸収する

フェーズごとのまとめは以下の通りです。

| 項目             | Claude Code Routines（断念） | GitHub Actions（断念） | ローカル実行（採用） |
| ---------------- | ---------------------------- | ---------------------- | -------------------- |
| 実行基盤         | Routines                     | GHA hosted             | launchd              |
| Bot Manager 通過 | 不可（HTTP 直叩き）          | 不可（hosted IP）      | 可（自宅 IP）        |

楽天 e-NAVI を対象にデータ取得する予定の方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

#### 参考リンク

- [Playwright Python 公式ドキュメント](https://playwright.dev/python/)
- [Playwright `expect_download` リファレンス](https://playwright.dev/python/docs/api/class-page#page-expect-download)
- [Apple Developer: launchd.plist man page](https://www.manpagez.com/man/5/launchd.plist/)
- [Apple Developer: Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [GitHub Actions hosted runner の IP 範囲](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners)
- [`curl_cffi` GitHub](https://github.com/yifeikong/curl_cffi)
- [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
- [gspread ドキュメント](https://docs.gspread.org/)
