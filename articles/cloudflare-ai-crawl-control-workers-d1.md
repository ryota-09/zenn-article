---
title: "そのブログ、AIにどれだけ読まれてる?CloudflareのAIボット制御機能まとめ"
emoji: "🤖"
type: "tech"
topics: ["cloudflare", "ai", "nextjs", "cloudflareworkers", "d1"]
published: true
---

:::message
この記事はAIとの共著です。
:::

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！最近はプロジェクトをインフラからバックエンド、フロントエンドまで一通り任せてもらっています。

2026年7月1日、Cloudflareが第2回「Content Independence Day」を発表しました。AIトラフィックを目的別に3分類する仕組みや、2026年9月15日から適用される新しいデフォルト挙動など、CloudflareでWebサイトを運用している人には見逃せない内容です。

このニュースを見て、ふと自分のブログのことが気になりました。「自分が書いた記事、AIにどれくらい読まれてるんだろう？」と。

この記事では前半で今回発表されたCloudflareのAIボット制御機能をまとめ、後半では「記事単位でAIアクセスを可視化する」ために自分のブログ（Next.js + Cloudflare Workers）に実装した仕組みを紹介します。以前書いた下記の移行記事の続編的な位置づけの記事にもなっています。

https://zenn.dev/ryota_09/articles/nextjs-cloudflare-workers-migration-infra

https://zenn.dev/ryota_09/articles/nextjs-cloudflare-workers-migration-app

:::message
本記事の内容は2026年7月時点の情報です。Cloudflareの機能・プラン仕様・デフォルト挙動は今後変更される可能性があります。
:::

## 📌 背景: クロールばかりが増えて、ユーザーのサイトへのアクセスは増えない

Webは長らく「コンテンツをクロールさせる代わりに、検索経由のトラフィックが返ってくる」という暗黙の取引の上に成り立ってきました。Cloudflare自身の説明ではウェブドメインの20%以上をカバーしているとされており、その立場から見ると、この30年近く続いてきた関係が崩れつつある、というのが今回（2026年7月）の発表の前提になっています。

きっかけとなったのは2025年7月、Cloudflareが最初の「Content Independence Day」で公表した数字でした。

> With OpenAI, it's 750 times more difficult to get traffic than it was with the Google of old. With Anthropic, it's 30,000 times more difficult.
>（出典: [Content Independence Day: no AI crawl without compensation!](https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/)）

かつてのGoogle経由でトラフィックを得ていたのと比べて、OpenAI経由では750倍、Anthropic経由では30,000倍、トラフィックの獲得が難しくなっている、という内容です。

さらにCloudflare Radarチームが2025年6月19日〜26日の1週間で測定した[「クロール対リファラル比率」](https://blog.cloudflare.com/ai-search-crawl-refer-ratio-on-radar/)では、Anthropic（Claude）は約**70,900:1**という結果でした。HTMLページへのリクエスト約71,000回に対し、リファラルが1回という計算です。一方でMistralは0.1:1と、逆にクロールよりリファラルの方が多いという例外的なケースも報告されています。

ただしこの70,900:1という数値には注記があり、Claudeのネイティブアプリ経由のアクセスにはReferer情報が付与されないため、実際の比率よりも高く出ている可能性がある、とCloudflare自身が言及しています。この数字を取り上げるときは、こうした注意点もあわせて見ておくのがフェアだと思います。

## 📌 2026年7月発表の新機能まとめ

ここからが本題です。2026年7月1日に発表された内容を、要素ごとに見ていきます。

### AIトラフィックの3分類（Search / Agent / Training）

今回の発表の核となるのが、AIによるアクセスを目的別に3つに分類する考え方です。

- **Search**: コンテンツを収集・インデックス化し、「後で」ユーザーの質問に答えるための挙動。原文では "any behavior that collects or indexes your content, so it can answer questions about it later" と説明されています。従来の検索クローラーに近く、サイト側はリファラル等の見返りを期待できるとされています
- **Agent**: リアルタイムに、人間の代理としてタスクを完了させるための自動アクセス。原文は "automated behavior that is acting, usually in real time, on a person's behalf, to get something done right now"。ChatGPTのブラウジング機能やClaude/Geminiのブラウザ統合などが該当します
- **Training**: モデルの学習・ファインチューニング用のクロール。取得したデータがモデルに恒久的に取り込まれる点が他の2つと大きく異なります

（定義の原文はいずれも[Your site, your rules: new AI traffic options for all customers](https://blog.cloudflare.com/content-independence-day-ai-options/)より）

この発表で重要なのは、「AIボット」を一括りにブロックするか許可するかではなく、**見返りの構造が異なるアクセスを分けて扱えるようにした**という点だと感じています。例えばGPTBotやClaudeBotはTraining、OAI-SearchBotやPerplexityBotはSearch、ChatGPT-UserやClaude-UserはAgentです。このように具体的なボットが各カテゴリに紐づいています。

なお、Google-ExtendedやApplebot-Extendedはこの3分類とは別軸の話です。実際にクロールを行うUser-Agentではなく、robots.txt上でAI学習用途を個別にオプトアウトするためのトークンで、クロール自体はGooglebot/Applebot本体のUser-Agentで行われます。混同しやすいポイントなので触れておきます。

### 2026/9/15から新規ドメインのデフォルトが変わる

もう1つの大きな変更が、デフォルト挙動の変更です。原文では次のように説明されています。

> For all new domains onboarding to Cloudflare, the categories of Training and Agent will be blocked by default on the pages that display ads.
>（出典: [同発表記事](https://blog.cloudflare.com/content-independence-day-ai-options/)）

**Cloudflareに新規オンボードするドメイン**では、広告を表示しているページに限り、TrainingとAgentのカテゴリがデフォルトでブロックされるようになります（Searchはデフォルト許可のまま）。この変更は2026年9月15日に施行される予定です。

一方で、この新しいデフォルトが既存ゾーンに将来的に適用されるかどうかは、今回の発表内で明言されていません。ただし新しい管理オプション自体はすでに全既存顧客が利用可能です。

> These new options to manage AI traffic are live now, and can be configured by all existing customers in their zone Settings.
>（出典: [同発表記事](https://blog.cloudflare.com/content-independence-day-ai-options/)）

オプトアウトも2026年9月15日までいつでもSecurity settingsから設定変更できます。

つまり、既存のCloudflareユーザーであっても「新しい設定項目が増えている」ことはすでに確認できる、という理解で良さそうです。

### Content Signalsの拡張（`use=`パラメータ）

2025年9月に発表されたContent Signals Policyでは、robots.txtに`search` / `ai-input` / `ai-train`の3シグナルが追加されました。今回はこれに加えて、`use=immediate` / `use=reference` / `use=full`というパラメータで利用範囲をより細かく指定できるようになりました。robots.txtが単なる「クロール可否のバイナリ」から「用途別の意思表示ツール」へと進化してきている流れとして捉えると分かりやすいと思います。

### BotBaseとForwardedヘッダー（軽く紹介）

Enterprise向けの機能として、検索可能なボットデータベース「BotBase」も発表されています。個人ブログを運用している立場ではあまり縁のない機能なので、ここでは名前の紹介にとどめます。

技術的に面白いと感じたのは、RFC 7239の`Forwarded`ヘッダーを使った信頼関係の申告の仕組みです。エージェントがユーザーの代理としてアクセスする際、「サイト運営者 → ボット提供企業 → エンドユーザー」という信頼の連鎖を、次のような形式のヘッダーで申告できます。[同発表記事](https://blog.cloudflare.com/content-independence-day-ai-options/)はこれを "a matter of transitive trust" と表現しています。

```
Forwarded: for="openai"
Forwarded: for="openai";use="reference"
```

どのAI企業のエージェントか、どういう用途でアクセスしているかをHTTPヘッダーで運ぶ、という設計です。関連して、ボットの身元をより暗号学的に証明する仕組みとして[Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)も用意されています。

ただしForwardedヘッダーもUser-Agentと同様に自己申告である点は変わりません。この「自己申告の限界」は、後半で紹介する自作実装の工夫ポイントとも繋がる話なので、頭の片隅に置いておいてください。

## 📌 AI Crawl Controlで何が見えるか（無料プランの範囲）

ここまで紹介した機能は、Cloudflareのダッシュボード上で「AI Crawl Control」という管理画面から操作します。2024年に「AI Audit」としてベータ提供が始まり、2025年8月28日に一般提供（GA）へ昇格すると同時に「AI Crawl Control」へ改名されました。

ダッシュボードには主に4つのタブがあります。

- **Overview**: ボットごとのリクエスト数を運営企業別に確認できる
- **Crawlers**: ボット個別にAllow/Blockを設定できる
- **Metrics**: フィルタやCSVエクスポートができる
- **Directives**: robots.txtの遵守状況を確認できる

Directivesタブは2025年10月の新設時点では「Robots.txt」という名称でしたが、2026年4月17日に改名されました。

プランによる違いも押さえておきたいポイントです（[公式ドキュメント](https://developers.cloudflare.com/ai-crawl-control/get-started/)で確認済み）。

| プラン | できること |
| --- | --- |
| 全プラン共通 | User-Agent文字列ベースの検出、ボットごとのAllow/Block設定 |
| 無料 | 上記に加えMetricsタブを利用可能。ただし**表示期間は過去24時間のみ** |
| 有料 | トップリファラーやtotal referralsの表示、カスタム402（支払い要求）レスポンス |
| Enterprise + Bot Management | Bot Management detection IDによる高精度な検出、分析期間のカスタマイズ、Pay Per Crawl（AIクローラーへの課金機能）、BotBaseなど |

特に「無料プランはMetricsタブの表示が過去24時間のみ」という制約は、後半で紹介する自作実装のモチベーションに直結してくるので覚えておいてください。

## 📌 【実践例】Workers + D1で記事単位のAIアクセス解析を自作する

ここからは実践編です。前半で紹介したAI Crawl Controlは、Cloudflareを「利用者」として使う話でした。今度は同じCloudflareを「開発者プラットフォーム」として使い倒し、AI Crawl Controlでは見えない部分を自分のブログに実装した話を紹介します。

### なぜ自作したか

AI Crawl Controlで分かるのは「どのボットが何回来たか」というボット単位の集計までで、**「どの記事がAIに読まれたか」までは分かりません**。加えて前述の通り、無料プランはMetricsタブの表示が過去24時間のみで、長期的なトレンドを振り返ることもできません。

自分のブログはOpenNext + Cloudflare Workersで動いているため、middlewareとD1を使って自前で実装するコストは低く済みました。

### アーキテクチャ

データの流れはシンプルです。

```
記事へのリクエスト /{locale}/blogs/{categoryId}/{blogId}
  → src/middleware.ts で User-Agent 判定 (classifyAiAccess)
  → AIボットなら event.waitUntil() で非同期に D1 へ UPSERT (レスポンスをブロックしない)
  → /{locale}/<非公開の管理画面パス> (Server Component, Basic認証) が D1 を集計して表示
```

![自作のAIアクセス解析ダッシュボード](https://static.zenn.studio/user-upload/f7abb0b86e9a-20260705.png)
*自作ダッシュボード（管理画面のパスは非公開）の実際の画面*

ダッシュボードには、総AIアクセス数・アクセスされた記事数・最多アクセスのAIサービスといったサマリーカードを表示しています。加えて直近30日の日別トレンドや、ベンダー・用途別のテーブル、記事別ランキングも確認できます（チャートライブラリは使わず、Tailwindのdiv幅%だけで棒グラフを描いています）。

動かし始めてまだ数日ですが、13記事に対して計29件のAIアクセスがすでに記録されています。内訳はAmazonの検索インデックス用途と、OpenAIのオンデマンド取得がそれぞれ8件で最多でした。AnthropicとMetaによる学習用収集も合計10件観測されており、本編で紹介した「検索・エージェント・訓練」という用途の違いが、個人ブログの規模でも実際に数字として見えてきます。

### コード

D1バインディングの定義はこうなっています。1つのWorkerに用途別のD1を複数バインドし、ISRのタグキャッシュ用DBとAIアクセス解析用DBを責務ごとに分けています。

```jsonc:wrangler.prd.jsonc
// オンデマンドrevalidation用 D1データベース（タグキャッシュ）
// AIアクセス解析用 D1データベース（記事×ボット×日付の集計）
"d1_databases": [
  {
    "binding": "NEXT_TAG_CACHE_D1",
    "database_name": "xxxxx-tags-prd",
    "database_id": "{database_id}"
  },
  {
    "binding": "AI_ACCESS_DB",
    "database_name": "xxxxx-ai-access-prd",
    "database_id": "{database_id}"
  }
]
```

middlewareではUser-Agentを判定し、AIボットからのアクセスであれば`event.waitUntil()`でD1への記録をバックグラウンド実行します。

```ts:src/middleware.ts
// canonical記事URLへのアクセスをUA判定し、AIボットであればD1への記録をバックグラウンドで実行する
function recordAiAccessIfArticleRequest(request: NextRequest, event: NextFetchEvent, pathname: string): void {
  const match = pathname.match(ARTICLE_PATH_PATTERN)
  if (!match) return

  const [, locale, categoryId, blogId] = match
  if (!routing.locales.includes(locale as (typeof routing.locales)[number]) || !KNOWN_CATEGORY_IDS.has(categoryId)) {
    return
  }

  const classification = classifyAiAccess(request.headers.get('user-agent'))
  if (!classification.isAiAccess) return

  event.waitUntil(recordAiAccessSafely({ locale, categoryId, blogId, bot: classification.bot }))
}

async function recordAiAccessSafely(params: {
  locale: string
  categoryId: string
  blogId: string
  bot: AiBotDefinition
}): Promise<void> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    if (!env.AI_ACCESS_DB) return // ローカルdev等バインディング未提供時は何もしない

    await recordAiAccessHit(env.AI_ACCESS_DB, {
      accessDate: new Date().toISOString().slice(0, 10),
      locale: params.locale,
      categoryId: params.categoryId,
      blogId: params.blogId,
      bot: params.bot,
    })
  } catch (error) {
    // 計測の失敗が記事表示という本体機能に波及しないよう握りつぶす
    console.error('[ai-access] record failed', error)
  }
}
```

ポイントは`event.waitUntil()`です。Workersのレスポンスを返却した後も処理を継続できるため、AIアクセスの記録処理が記事本体のレスポンス速度に一切影響しません。また`getCloudflareContext()`はOpenNext環境でNext.jsのコードからD1バインディングにアクセスするための決まった作法です。

D1への書き込みは、生ログを貯めずに最初から集約する設計にしています。

```ts:src/lib/ai-access/repository.ts
// D1へAIアクセスの集計行をUPSERTする（1リクエスト=1呼び出し想定）
export async function recordAiAccessHit(db: D1Database, event: AiAccessEventInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_access_daily (access_date, locale, category_id, blog_id, bot_id, vendor, purpose, hit_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
       ON CONFLICT(access_date, blog_id, bot_id) DO UPDATE SET hit_count = hit_count + 1`
    )
    .bind(
      event.accessDate,
      event.locale,
      event.categoryId,
      event.blogId,
      event.bot.botId,
      event.bot.vendor,
      event.bot.purpose
    )
    .run();
}
```

日付×記事×ボットの組み合わせで`UNIQUE`制約を張り、`ON CONFLICT ... DO UPDATE SET hit_count = hit_count + 1`のUPSERT一発でカウントアップする形にしました。1リクエストごとに生ログを積むのではなく、最初から集約された行として持つことで、D1の行数もクエリコストも抑えられます。

### 工夫ポイント

**1. `cf.botManagement.verifiedBot`をあえて使わなかった**

Cloudflare Workersには`request.cf.botManagement.verifiedBot`という組み込みフィールドがあり、一見するとこれでAIボット判定ができそうに見えます。しかし実際には次の2つの理由でAI判定には使えませんでした。

- (a) Enterprise Bot Management契約時のみ設定される
- (b) AI/非AIを区別できず、Googlebotのような一般的な優良ボットでも`true`になる

```ts:src/lib/ai-access/classify.ts
/**
 * User-Agent文字列からAIアクセスを判定する。
 *
 * 補足: Cloudflare Workersのrequest.cfには「verifiedBotCategory」という文字列フィールドは存在せず、
 * cf.botManagement.verifiedBot（真偽値）はEnterprise Bot Management契約時のみ設定される上、
 * AI/非AIを区別できない（Googlebot等の一般的な優良botもtrueになる）ため判定には使用しない。
 * UAは自己申告であり偽装可能な点を踏まえ、既知パターンとの部分一致による分類に留める。
 */
export function classifyAiAccess(userAgent: string | null): AiAccessClassification {
  if (!userAgent) {
    return { isAiAccess: false, bot: null };
  }

  const lowerUa = userAgent.toLowerCase();
  const matches = AI_BOT_CATALOG.filter((bot) => lowerUa.includes(bot.uaToken.toLowerCase()));

  if (matches.length === 0) {
    return { isAiAccess: false, bot: null };
  }

  // 複数マッチした場合はより特異的な（トークンが長い）定義を優先する
  const bot = matches.reduce((longest, current) =>
    current.uaToken.length > longest.uaToken.length ? current : longest
  );
  return { isAiAccess: true, bot };
}
```

結局、各社クローラーの公式ドキュメントとCloudflareのBot Referenceを元に、このブログが検知対象として独自に選定した18種のUser-Agentトークンとの部分一致で判定する方式に落ち着きました。「18種」はあくまで独自の選定であり、Cloudflareが公開している公式の全一覧ではありません。

また、本編で触れた通りUser-Agentは自己申告のため、偽装されたアクセスまでは検出できません。行儀よく名乗ってくれるボットを数える仕組み、という割り切りです。

**2. 本体のレスポンスを1msも遅くしない**

前述の通り、D1への書き込みは`event.waitUntil()`で非同期化し、失敗時もtry/catchで握りつぶしています。「計測の失敗が記事表示という本体機能に波及しないよう握りつぶす」というコメントをmiddleware.tsにそのまま残しているくらい、ここは優先度を明確にしました。

**3. 生ログを貯めない集約設計**

前述のUPSERTの通り、日付×記事×ボットで最初から集約する設計にしています。アクセスの度に行を増やすのではなく、`hit_count`をインクリメントするだけなので、D1のストレージ・クエリコストの両方を抑えられます。

### 3分類との符合

自作したカタログでは、AIアクセスを`training` / `search_index` / `user_fetch`という3つの用途に分類していました。これは各社クローラーの公式ドキュメントとCloudflareのBot Referenceを参考に独自に設計したものです。

面白いことに、これがCloudflareが今回発表したTraining / Search / Agentの3分類と、ほぼ1対1で対応していました。`search_index`がSearchに、`user_fetch`がAgentに、それぞれ近い概念です。

ただし正直に書いておくと、この自作の実装コミットは2026年7月3日で、Cloudflareの発表（7月1日）よりも後です。「発表前から同じ設計に気づいていた」わけではなく、「各社ボットの公式ドキュメントから分類を組み立てたら、結果的にCloudflareの新3分類ときれいに対応していた」というのが正確なところです。それでも、AIトラフィックを「用途」で3つに切るのは、独立した視点からたどり着いても近い結論になる、自然な分類なのだろうと感じました。

## 📌 まとめ

CloudflareのAIボット制御を巡るこの1年の流れをまとめると、「可視化 → 意思表示（robots.txt / Content Signals）→ 制御（ブロック）」という段階が一通り揃ってきた、という印象です。

- **AIトラフィックはもう一括りではない**: Search / Agent / Trainingという3分類が用意され、見返りの構造が異なるアクセスを分けて扱えるようになった
- **2026年9月15日にデフォルトが変わる**: 新規オンボードのドメインでは、広告表示ページのTraining/Agentがデフォルトブロックになる。既存ユーザーも新しい設定項目は今すぐ確認できる
- **無料プランでも可視化はできるが限界もある**: AI Crawl Controlはボット単位・直近24時間までが無料範囲。「記事単位」「長期トレンド」を見たいなら自作の余地がある
- **robots.txtは用途別の意思表示ツールへ**: Content Signalsと`use=`パラメータで、ブロック以外の細かい意思表示ができるようになった

筆者自身のスタンスとしては、AIクローラーを全てブロックするつもりはありません。[llms.txtを置く](https://zenn.dev/ryota_09/articles/a3e9f2008469a2)など、AIに読まれること自体はむしろ歓迎しています。ただ「実態を把握した上で選択できる状態」を作っておくことが大事だと思っています。今回はまず観測（可視化）の部分を自作で補ってみた、という位置づけです。

同じようにCloudflareでブログやサイトを運用している方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

## 📌 参考資料

- [Introducing AI Crawl Control](https://blog.cloudflare.com/introducing-ai-crawl-control/)
- [Content Signals Policy](https://blog.cloudflare.com/content-signals-policy/)
- [AI Crawl Control docs](https://developers.cloudflare.com/ai-crawl-control/)
- [AI Crawl Control: Get started](https://developers.cloudflare.com/ai-crawl-control/get-started/)
- [AI Crawl Control changelog: Directivesタブへの改名（2026/4/17）](https://developers.cloudflare.com/changelog/post/2026-04-17-tools-for-agentic-internet/)
- [Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/)
- [Bot reference](https://developers.cloudflare.com/ai-crawl-control/reference/bots/)
- [Radar Bots Directory](https://radar.cloudflare.com/bots/directory)
