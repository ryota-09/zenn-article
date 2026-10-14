---
title: "小規模なサイトで実測した攻撃について共有"
emoji: "🥷"
type: "tech"
topics: ["cloudflare", "nextjs", "security", "react", "waf"]
published: false
---

:::message
この記事はAIとの共著です。
:::

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！最近はプロジェクトをインフラからバックエンド、フロントエンドまで一通り任せてもらっています。

今回は **月700セッションほどの小規模なWebサイトに、30日間でどんな攻撃が届いていたのか** を、Cloudflare のログから数えて共有します！

:::message alert
**この記事を公開する意図について**

この記事は、攻撃手法を紹介・拡散することを目的としたものではありません。そうした意図は一切ないことを、最初にお伝えしておきます。

「小さなサイトだから狙われないだろう」と感じている方も多いと思います。正直なところ、筆者もそう思っていました。そんな方に、実際に届いている攻撃の記録を見ていただきたいと思って書きました。この記録が、ご自身のサイトの対策を見直すきっかけになればうれしいです。

そのため本文では、攻撃の再現につながるペイロードや手順は載せていません。観測した事実と、防御側でとった対策に絞って書いています。送信元の IP アドレスなど、個別の識別情報も伏せています。

また、本文で紹介している対策は、実際に講じているもののすべてではありません。対策をすべて公開すると、悪意のある第三者に防御の穴を探す手がかりを与えてしまうおそれがあるため、あえて伏せている内容もあります。
:::

先に結論をまとめると、次のとおりです。

- 月700セッション程度の小規模なWebサイトでも、30日間で **約24.6万リクエストのうち約5,100件** を Cloudflare がブロックしていました
- 最も多かったのは Next.js を狙った **React2Shell(CVE-2025-55182)** で、次が WordPress の脆弱性を狙ったものでした。このサイトは WordPress ではありません
- **ChatGPT や Claude などの AI ボットの名前を騙ったリクエストが、React2Shell の攻撃を送っていました**(本物のボットではありません)
- 確認できた範囲では、実害はありませんでした。WAF(Web Application Firewall)だけでなく、バージョン管理や構成の工夫も含めた何層かの防御が効いていました

## 📌 30日間の全体像

### 計測したサイト

計測の対象は、筆者が運営している小規模なWebサイトと、Storybook を配信しているそのサブドメインです。サイト名やドメイン、計測した時期は伏せて書きます。集計した期間は30日間です。

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Next.js 16 / React 19 |
| 実行基盤 | Cloudflare Workers(OpenNext) |
| Cloudflare のプラン | ドメイン(ゾーン)は Free、Workers は Workers Paid |
| サブドメイン | Storybook の静的ビルドを Cloudflare Pages で配信 |
| 規模 | GA4 で月700セッション程度 |
| PHP / WordPress | 使っていない |

:::message
Cloudflare では、ドメイン(ゾーン)ごとのプランと、Workers などのアカウント単位の有料プランが別になっています。この記事で「Free プラン」と書いているのは、WAF などのセキュリティ機能の範囲が決まる **ドメインのプラン** のことです。Workers は有料の Workers Paid を使っていますが、本記事で紹介するセキュリティ機能はすべてドメインの Free プランの範囲のものです。
:::

### 24.6万リクエスト中、約5,100件をブロック

Cloudflare の Security Analytics で30日間の数字を見ると、次のようになっていました。

![30日間のリクエストの内訳](/images/small-site-attack-report/traffic-breakdown.png)

全リクエスト246.43kのうち、約89%はキャッシュなどから配信され、オリジン(Workers)まで届いたのは21.62kでした。そして **5.1k(約2.1%)を Cloudflare がブロック** していました。ブロックの半分強は、Cloudflare が無料で提供しているマネージドルール(Cloudflare が用意・更新している既知の攻撃向けのルール集)によるものです。

割合にすると約2%ですが、件数にすると5,000件を超えます。単位は違いますが、**純粋なユーザーアクセス数より、ブロックした件数のほうがずっと多い** 状態でした😅

ここから先は、ブロックされたリクエストの中身を見ていきます。セキュリティイベント画面のサンプルログを1日ずつ開いて、重複を除いた **648件** を集めました。送信元は IP アドレス131個、ASN(ネットワークの管理単位)39個、27か国に散らばっていて、日本からは13件だけでした。

:::message
サンプルログは Cloudflare の適応サンプリングで間引かれていて、1日に表示できる件数にも上限があります。そのため、以降に出てくるサンプルの割合はあくまで目安です。全体の件数は上の集計値を参照してください。
:::

サンプル648件を攻撃の種類で分けると、次のようになりました。

| 種類 | 件数 | 割合 |
| --- | --- | --- |
| React2Shell(CVE-2025-55182) | 295 | 46% |
| WordPress の脆弱性を狙ったもの | 225 | 35% |
| レート制限に引っかかった総当たり | 59 | 9% |
| カスタムルール(脆弱性スキャン遮断) | 47 | 7% |
| ブラウザ整合性チェック | 22 | 3% |

## 📌 実際に届いた攻撃

### React2Shell(Next.js を狙ったもの)

![React2Shell の攻撃の流れ](/images/small-site-attack-report/attack-react2shell.png)

最も多かったのが React2Shell です。Next.js の App Router などで使われている React Server Components の処理の欠陥を突いて、**ログインなしでサーバー上のコードを実行できてしまう** 脆弱性で、2025年12月3日に公開されました。深刻度を表す CVSS のスコアは、最高値の10.0です。米国の CISA(サイバーセキュリティ・インフラストラクチャ安全保障庁)が公開している「悪用が確認された脆弱性」のカタログにも、公開の2日後に追加されています。

悪用されたサーバーでは、クラウドの認証情報や SSH 鍵を探して外部に送る動きや、暗号資産のマイニングが観測されたと報告されています。

https://www.wiz.io/ja-jp/blog/nextjs-cve-2025-55182-react2shell-deep-dive

サンプルでは295件あり、**すべて POST リクエスト** でした。30日のうち26日で観測されていて、ほぼ毎日届いていたことになります。

狙われたパスを多い順に並べると、`/`、`/api`、`/auth/callback`、`/admin`、`/dashboard`、`/login`、`/account`、`/api/auth` などでした。このサイトには `/auth/callback` も `/dashboard` もありません。**Next.js アプリによくあるルートを、片っ端から試している** と見られます。

送信元のネットワークは Google Cloud が140件と最多で、国別ではオランダとアメリカが大半でした。

:::message
送信元として出てくる Google Cloud や Microsoft Azure などは、攻撃者が借りたサーバーの置き場所にすぎません。クラウド事業者が攻撃しているわけではない点に注意してください。国についても同様で、サーバーの所在地であって攻撃者の所在地とは限りません。
:::

ブロックしたのは、Cloudflare が無料で提供しているマネージドルールです。Cloudflare は脆弱性の公開とほぼ同時にこの攻撃向けのルールを用意していて、Free プランでも既定で有効になっていました。何も設定していなくても止まっていた、というのは心強いですね。

### WordPress の脆弱性(WordPress ではないのに届く)

![WordPress 系の攻撃の流れ](/images/small-site-attack-report/attack-wordpress.png)

2番目に多かったのは WordPress を狙った攻撃で、サンプルでは225件ありました。このサイトは Next.js 製なので、WordPress は動いていません。それでも22日間にわたって届いていました。

最も多かったのは、`wp-config.php` のバックアップファイルを探すリクエストです。`wp-config.php.bak`、`.old`、`.save`、`.swp`、末尾に `~` が付いたものなど、さまざまな拡張子が試されていました。エディタの一時ファイルや手作業でのコピーで残った設定ファイルから、データベースのパスワードを拾おうとしているのだと思います。

次に目立ったのが、`/wp-json/batch/v1` への POST です。これは2026年7月に公開された WordPress コアの脆弱性「wp2shell」(CVE-2026-63030 と CVE-2026-60137 の組み合わせ)を狙ったもので、こちらも CISA のカタログに入っています。WordPress を使っている方は、各系列の修正版(7.0.2 / 6.9.5 / 6.8.6)以降に更新されているか確認しておくと安心です。

これらから分かるのは、**少なくとも WordPress 系の攻撃は、サイトが何で作られているかを確認せずに送られてくる** ということです。「WordPress を使っていないから WordPress の脆弱性は関係ない」というのはその通りなのですが、リクエスト自体は届きます。

### AI ボットのなりすまし

![AI ボットのなりすましの仕組み](/images/small-site-attack-report/attack-ai-bot-impersonation.png)

今回いちばん驚いたのがこれです。ブロックされたリクエストのうち、User-Agent に AI ボットの名前を含むものが **107件** ありました。なりすましボットは25種類にのぼり、一番多かったのは ChatGPT-User など OpenAI のボットへのなりすまし(17件)でした。

:::message alert
ここで出てくるボット名は、あくまで **なりすましに使われた名前** です。各社のボットが攻撃していたという意味ではありません。
:::

そして、この107件のうち **90件が React2Shell の攻撃** でした。本物の AI クローラーが、脆弱性を突く POST リクエストを送ってくることはまず考えられません。**AI ボットの名前を騙った攻撃** と見るのが自然です。

送信元を見ると、107件中101件が Google Cloud からでした。ただし、クラウド上で動いている正規のクローラーもあるので、送信元のネットワークだけで偽物と決めつけることはできません。本物かどうかは、各社が案内している方法で確かめられます。

- **Googlebot**: 逆引き DNS か、公開されている IP レンジとの照合で確認できます
- **OpenAI のボット**: GPTBot・ChatGPT-User・OAI-SearchBot それぞれの IP レンジが公開されています
- **Anthropic のボット**: クローラーの IP アドレスの一覧が公開されています

今回は個々の IP アドレスまでは照合していません。それでも、脆弱性を突く POST を送っていたという中身から、本物とは考えにくいと判断しています。

なぜわざわざ AI ボットになりすますのかというと、**「ブロックされにくい相手」に見せかけるため** だと考えています。AI クローラーや検索エンジンのクローラーは、サイト運営者が WAF の除外リストに入れていることがあります。User-Agent だけを見て通す設定になっていれば、そのまま素通りできてしまいます。

ボットを許可したい場合は、User-Agent ではなく Cloudflare の **検証済みボット(`cf.client.bot`)** で判定するのが安全です。Cloudflare が IP アドレスや逆引き DNS、署名などで本物と確認したボットだけが `true` になるので、名前を騙っただけのリクエストは対象外になります。

ちなみに、Cloudflare の AI Crawl Control 画面で「ChatGPT-User」のアクセス先を見てみました。すると、Storybook 側の `/.env.production` や `/docker-compose.yml` が含まれていました。ChatGPT のユーザーがこれらのファイルを読みに来るとは考えにくいです。この集計にも、なりすましが混ざって見えている可能性があります。

### 秘密ファイル探しと Webシェル探し

![秘密ファイル探しと Webシェル探しの流れ](/images/small-site-attack-report/attack-secret-file-scan.png)

レート制限とカスタムルールで止まったものの多くは、**1つの IP から数秒の間に数十〜数百のパスを総当たりする** タイプでした。探していたものを分類すると、次のようになります。

| 送信元 | 探していたもの |
| --- | --- |
| Google のネットワーク | GCP / Firebase の認証情報ファイル(`application_default_credentials.json`、`firebase-adminsdk.json`、`key.json` など) |
| Google Cloud | Docker の設定(`.docker/config.json`)、SSH の秘密鍵(`id_ed25519`)、`rclone.conf`、各ディレクトリ配下の `.env` |
| ホスティング事業者のネットワーク | `.git/config`、`.git-credentials`、`.svn/entries` を `/api/v2/` や `/dev/` などの配下まで |
| Microsoft Azure | Webシェルらしき名前の `.php` ファイルを大量に |

認証情報ファイル探しは、React2Shell の悪用後に報告されている「クラウドの認証情報を盗む」動きと目的が同じです。脆弱性を突いてサーバーの中から盗むか、うっかり公開されたファイルを外から拾うか、ルートが違うだけとも考えられます。

最後の Webシェル探しは、`mal.php` や `wp-happy.php` のような、**他の誰かがすでに仕込んだバックドアの残骸** を探すリクエストでした。他人が乗っ取ったサイトを横取りしようとするスキャンと見られます。自分のサイトに何も仕込まれていなくても、総当たりで届きます。

### 狙われやすかった場所

![ホスト別の偏り](/images/small-site-attack-report/attack-targeted-hosts.png)

ホスト別に見ると、偏りが2つありました。

1つ目は **Storybook 用のサブドメイン** です。サンプル648件のうち170件(26%)がこちら宛てでした。特に秘密ファイルの総当たりは、レート制限で止めた59件中43件がサブドメイン宛てでした。サブドメインは証明書の発行記録などから機械的に見つけられます。「本番より守りが手薄な開発用の環境」を狙っているのだと考えています。

2つ目は **ポート番号付きのホスト** です。React2Shell の攻撃のうち36件は、`:8443` や `:8080` を付けたホスト宛てでした。Cloudflare はこれらのポートもプロキシするので、別ポートで管理画面や開発サーバーが動いていないかを探っているのだと思います。

## 📌 実害がなかった理由とCloudflare Free プランでできること

### 何層かの防御が重なっていた

これだけ届いていても、筆者が確認できた範囲では実害はありませんでした。Workers 側でエラーは出ておらず、侵害の痕跡も見つかっていません。理由を整理すると、WAF で止めたことだけでなく、次の4つが重なっていました。

![攻撃の種類と、それを防いだ層の対応](/images/small-site-attack-report/defense-layers.png)

1. **Cloudflare で手前で止める**: マネージドルール・カスタムルール・レート制限・ブラウザ整合性チェック
2. **脆弱なバージョンを使っていない**: React2Shell の影響を受けるバージョンを、本番で一度も動かしていない
3. **攻撃対象のソフトが無い**: PHP も WordPress も動いていない
4. **秘密ファイルを公開していない**: `.env` などはビルド成果物に含まれず、存在しないパスには404を返す

2つ目の「脆弱なバージョンを使っていない」について補足します。React2Shell が公開された時点で、このサイトは Next.js 14.2 / React 18 で動いていました。公式のアドバイザリでは、Next.js 14 の安定版は影響を受けないバージョンとされています。

そして公開から数日のうちに、修正版の Next.js 16.0.7 / React 19.2.1 へ一気に更新しました。影響を受けるバージョンを経由せずに更新できたのは、運が良かった面もあります。その後も関連する脆弱性の修正が続いたので、今はさらに新しいバージョンに更新しています。

なお、Next.js 14 が影響を受けなかったのは React2Shell に限った話です。古いバージョンのままで良いという意味ではないので、ご注意ください。

:::message alert
WAF はあくまで攻撃を手前で止める緩和策で、脆弱性そのものを直すものではありません。Cloudflare 自身もパッチの適用をあわせて推奨しています。React2Shell の攻撃は、公開からかなり時間がたった今もほぼ毎日届いています。**重大な脆弱性が出たら、できるだけ早く更新する** 前提で考えておくのが安全です。
:::

### 存在しないパスに200を返していた

ただし、1つ見落としていたことがありました。Storybook 用のサブドメインが、**存在しないパスにも200で index.html を返していた** のです。

Cloudflare Pages は、トップレベルに `404.html` が無いとシングルページアプリケーション(SPA)とみなして、存在しないパスにもルートの内容を返します。Storybook の静的ビルドには `404.html` が無いので、`/.env.production` へのリクエストにも Storybook の HTML が200で返っていました。

中身は Storybook の HTML なので、秘密の情報が漏れたわけではありません。ただ、スキャンする側からは「`.env.production` があった」ように見えてしまいます。追加の攻撃を呼び込む可能性がありますし、ログを見たときにもかなりヒヤッとします😅

対策は、`404.html` を置くか、カスタムルールで手前で止めるかのどちらかです。今回は次に紹介するカスタムルールで止めるようにしました。

### Free プランで入れた設定

ここで紹介する設定は、すべてドメインの Free プランの範囲で使えるものです。設定と効果は次のとおりです。

| 対策 | 設定 | 効果 |
| --- | --- | --- |
| マネージドルール | 何もしなくても有効 | React2Shell・wp2shell を自動でブロック(2.72k件) |
| カスタムルール | 使っていない技術・秘密ファイルへのパスをブロック | 作成したばかりで、768件 |
| レート制限 | IP ごとに10秒間200回を超えたらブロック | 最近追加して、1.59k件 |
| ブラウザ整合性チェック | 既定で有効。不審なヘッダーを持つリクエストを止める | 24件 |
| Bot Fight Mode | 様子見で OFF | なし |

#### カスタムルール「脆弱性スキャン遮断」

このサイトで使っていない技術や、公開しているはずのないファイルへのパスを、まとめてブロックするルールです。

```txt:カスタムルールの式
(
  lower(http.request.uri.path) contains ".php"
  or lower(http.request.uri.path) contains "/wp-"
  or lower(http.request.uri.path) contains "/wordpress"
  or lower(http.request.uri.path) contains "xmlrpc"
  or lower(http.request.uri.path) contains "phpmyadmin"
  or lower(http.request.uri.path) contains "/cgi-bin"
  or lower(http.request.uri.path) contains "/.env"
  or lower(http.request.uri.path) contains "/.git"
  or lower(http.request.uri.path) contains "/.svn"
  or lower(http.request.uri.path) contains "/.aws"
  or lower(http.request.uri.path) contains "/.ssh"
  or lower(http.request.uri.path) contains "/.ht"
  or lower(http.request.uri.path) contains "/.ds_store"
  or lower(http.request.uri.path) contains "/.vscode"
  or lower(http.request.uri.path) contains "/@fs/"
)
and not cf.client.bot
```

アクションは「ブロック」です。ポイントは2つあります。

1つ目は、**`.php` を丸ごとブロックしている** ことです。PHP を使っていないサイトだからこそ打てる、強めの対策です。自分のサイトの技術構成を把握していれば、「使っていないもの宛てのリクエストは、ほぼ攻撃」とみなせます。なお `/@fs/` は、Vite の開発サーバーが外部に公開されている場合に、サーバー上のファイルを読み出そうとするパスです。

2つ目は、**`not cf.client.bot` で検証済みボットを除外している** ことです。本物の Googlebot などが誤ってブロックされるのを防ぎつつ、AI ボットのなりすましは検証済みにならないので、そのままブロックされます。

このルールは、集計期間の終わりごろに作成したばかりです。それでも、すでに768件をブロックしています！カスタムルールはマネージドルールより先に評価されるので、作成後は WordPress 系のマネージドルールの発火がほぼ見えなくなりました。

:::message
`/wp-` や `.php` が、自分のサイトの正規の URL(記事のスラッグなど)に含まれていないかは事前に確認してください。Free プランでは、カスタムルールを5本まで作れます。
:::

#### レート制限

レート制限は、IP ごとに10秒間で200回を超えたらブロックする設定にしています。ページの表示で大量に読み込まれる `/_next/static/` 配下と、検証済みボットは対象外です。

```txt:レート制限ルールの式
not starts_with(http.request.uri.path, "/_next/static/")
and not cf.client.bot
```

Free プランでは、レート制限ルールは1本だけ作れます。数える単位は IP のみで、期間も10秒固定です。それでも、秘密ファイルや Webシェルの総当たりのように「1つの IP から短時間に大量に送る」タイプには十分効きました。最近追加したばかりですが、すでに1,500件以上をブロックしています。

#### Bot Fight Mode は様子見

Cloudflare には Bot Fight Mode という無料のボット対策もありますが、SEO 上の理由から今は様子見で OFF にしています。後ほど適用する可能性があります。

Bot Fight Mode はドメイン全体にかかる仕組みで、カスタムルールで例外を作れません。検索エンジンへの影響を確認してから判断するつもりです。

### 自分のサイトで確認する方法

Cloudflare を使っていれば、Free プランでも同じことを確認できます。

1. **Security Analytics** で期間を「過去30日」にして、全体の件数とブロックの内訳を見る。現在は Free プランでも30日分を見られます
2. **セキュリティイベント** でブロックされたリクエストを開き、ルール名・パス・User-Agent・ASN を見る
3. **AI Crawl Control** で AI ボットごとに絞り込み、アクセス先のパスを見る。AI ボットのなりすましが不自然なパスに来ていないかの確認に便利です

ただし、Free プランで分析するにはいくつか制約があります。筆者の環境では、Security Analytics でパスや User-Agent による絞り込みができませんでした。セキュリティイベントのログはサンプリングされていて、1画面に表示できる件数にも上限があります。

今回は、セキュリティイベントの期間を1日ずつ区切って、各行を展開して集める力技で集計しました。全部を調べなくても、数日分のログを眺めるだけで「どんなリクエストが来ているのか」の雰囲気はつかめると思います！

## 📌 まとめ

月700セッションほどの小規模なWebサイトでも、30日間で5,000件を超えるリクエストを Cloudflare がブロックしていました。攻撃はサイトの規模に関係なく、機械的に届きます。

- **重大な脆弱性はすぐ更新する**: React2Shell は公開からかなり時間がたっても、ほぼ毎日届いていた。WAF は時間稼ぎで、根本対策は更新
- **使っていない技術宛てのリクエストは丸ごと止める**: PHP や WordPress を使っていないなら、カスタムルールで一括ブロックできる
- **秘密ファイルを公開ディレクトリやビルド成果物に入れない**: `.env`・`.git`・クラウドの認証情報・SSH 鍵は、繰り返し探されている
- **存在しないパスに200を返していないか確認する**: SPA のフォールバックは、スキャンする側に「当たり」に見える
- **開発用のサブドメインも本番と同じように守る**: 秘密ファイル探しは、本番より Storybook 用のサブドメインに集中していた
- **ボットは User-Agent ではなく検証済みボットで判定する**: AI ボットになりすました攻撃は実際に届いている

今回の集計で一番の学びは、AI ボットのなりすましでした。AI クローラーを歓迎するために WAF の例外を作っている方は、User-Agent だけで判定していないか、一度見直してみてください。

実際に数えてみて、「小規模なサイトだから攻撃されないだろう」とないがしろにせず、きちんと対策しないといけないなと強く感じました。Free プランの範囲でもできることは多いので、まずは自分のサイトのログを一度のぞいてみるところから始めてみてください！

同じように個人サイトや個人開発のサービスを運用している方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

**参考資料**

:::details 参考資料の一覧を開く

- [Critical Security Vulnerability in React Server Components(React 公式ブログ)](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)
- [Security Advisory: CVE-2025-66478(Next.js 公式ブログ)](https://nextjs.org/blog/CVE-2025-66478)
- [CISA Adds One Known Exploited Vulnerability to Catalog(2025-12-05)](https://www.cisa.gov/news-events/alerts/2025/12/05/cisa-adds-one-known-exploited-vulnerability-catalog)
- [Cloudflare WAF proactively protects against React vulnerability(Cloudflare ブログ)](https://blog.cloudflare.com/waf-rules-react-vulnerability/)
- [WordPress 7.0.2 Release(WordPress.org)](https://wordpress.org/documentation/?p=16369429)
- [CVE-2026-63030 and CVE-2026-60137 affecting WordPress(NCSC NZ)](https://www.ncsc.govt.nz/alerts/cve-2026-63030-and-cve-2026-60137-affecting-wordpress/)
- [wp2shell: a critical remote code execution vulnerability in WordPress core(Rapid7)](https://rapid7.com/blog/post/etr-cve-2026-63030-wp2shell-a-critical-remote-code-execution-vulnerability-in-wordpress-core)
- [CISA Adds Four Known Exploited Vulnerabilities to Catalog(2026-07-21)](https://www.cisa.gov/news-events/alerts/2026/07/21/cisa-adds-four-known-exploited-vulnerabilities-catalog)
- [Verifying Googlebot and other Google crawlers(Google)](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot)
- [Overview of OpenAI Crawlers(OpenAI)](https://developers.openai.com/api/docs/bots)
- [Anthropic のクローラーに関するヘルプ記事(Anthropic)](https://support.claude.com/en/articles/8896518)
- [cf.client.bot(Cloudflare Docs)](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.client.bot/)
- [Verified bots(Cloudflare Docs)](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/)
- [Custom rules(Cloudflare Docs)](https://developers.cloudflare.com/waf/custom-rules/)
- [Workers Pricing(Cloudflare Docs)](https://developers.cloudflare.com/workers/platform/pricing/)
- [Rate limiting rules(Cloudflare Docs)](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Bot Fight Mode(Cloudflare Docs)](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)
- [Serving Pages(Cloudflare Docs)](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Security Events(Cloudflare Docs)](https://developers.cloudflare.com/waf/analytics/security-events/)
- [30 days of analytics on every plan(Cloudflare changelog)](https://developers.cloudflare.com/changelog/post/2026-10-02-30-days-analytics-on-every-plan/)

:::
