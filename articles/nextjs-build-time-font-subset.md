---
title: "Google Fontsをやめてビルド時に利用する文字だけの日本語フォントアセットを作る"
emoji: "✂️"
type: "tech"
topics: ["nextjs", "lighthouse", "font", "frontend", "performance"]
published: true
---

:::message
この記事はAIとの共著です。
:::

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

今回は **Google Fontsの分割配信をやめて、ビルド時に「自分のブログで使う文字だけ」の日本語サブセットフォントを生成・自己ホストする方法** を紹介していきます！

日本語のWebフォントはフルセットで数MBという重量級で、パフォーマンス改善の定番の悩みどころですよね。この記事では「コンテンツがビルド時に確定する静的サイトなら、フォントもビルド成果物にしてしまえばいい」という発想で、記事ページのフォント転送量を **280〜631KB → 約283KB固定** に削減した過程を紹介します。調べた範囲では同じアプローチの日本語ブログ向け実装事例が見つからなかったので、設計と実装をまるごと共有します！

## 📌 前提と背景

対象は筆者の個人ブログです。構成は以下の通りです。

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16（App Router / Turbopack） |
| ホスティング | Cloudflare Workers（`@opennextjs/cloudflare`） |
| コンテンツ | MDX + Velite（**全コンテンツがビルド時に確定する**） |
| 本文フォント | Kosugi Maru（丸ゴシック・Regularの1ウェイトのみ） |
| 計測基準 | Lighthouse mobile（Slow 4G + 4x CPUスロットリング） |

このブログでは以前、`next/font/google` が生成するフォントCSSがrender-blockingになってLCPを悪化させる問題に対処しました。`@font-face` 定義を静的CSSファイルに切り出し、preloadで先読みしつつ **loadイベント後にscriptで挿入する**（挿入されたstylesheetは仕様上render-blockingにならない）方式です。JavaScript無効環境向けには、noscriptで通常のstylesheetを併記しています。フォールバックには `next/font` が生成していたsize-adjust実績値を流用し、CLS 0を維持しています。

これでrender-blockingは解消できたのですが、**本番の記事詳細ページのスコアは57〜62のまま**でした😅

### 実際のUXとスコアが乖離していた

まず不思議だったのは、体感とスコアのギャップです。Slow 4G + 4x CPUスロットリングをかけたコールドスタートの実測トレースでは、LCPは2.5〜4.0秒に収まっていました。ところがLighthouseのレポート上のLCPは6.4〜10.0秒と、実測の2倍以上の値が出ていました。

当時の本番計測値がこちらです。

| 記事ページ | Perf | FCP | LCP | フォント転送量 |
|------|------|------|------|------|
| 記事A | 62 | 4.4s | 6.4s | 280KB |
| 記事B | 60 | 6.2s | 8.1s | 423KB |
| 記事C | 57 | 8.0s | 10.0s | 631KB |

並べてみると、**FCPがフォント転送量にきれいに比例している**のが分かります。フォント転送量は記事に含まれる漢字の種類数で決まるので、「漢字が多い記事ほどスコアが下がる」という状態でした。

#### 乖離の正体はLanternのシミュレーション

Lighthouseのスコアは実測値ではなく、**Lantern**というシミュレーションエンジンが観測したネットワーク記録から算出した推定値です。そして、ここに未解決の既知バグがあります。

https://github.com/GoogleChrome/lighthouse/issues/11460

`font-display: swap` のフォントは実際のLCPをブロックしないのに、**preloadなどでfirst paint前に読み込みが完了したフォントがシミュレーションのFCP/LCP計算に算入されてしまう**、という問題です。2020年から報告されているまま、現在もOpenです。

筆者のブログではフォントCSSをload後に挿入しているため、ヘッドレス観測ではフォントが「first paintより前に完了したリクエスト」として記録されていました。その結果、記事ごとに34〜49ファイルに分かれて落ちてくるフォント（280〜631KB）がそのままシミュレーションFCPに乗り、**転送量に比例してスコアが下がる**構造になっていました。

ここまで分かると、打ち手は1つしかありません。

**フォントの転送量そのものを削るしかありません。そして転送量の削減は、シミュレーション値だけでなく実際のUXにも普通に効きます。**

### Google Fontsの「121分割」の正体

そもそも、なぜ記事ごとに34〜49ファイルもフォントが落ちてくるのでしょうか。

Google Fontsは日本語フォントを配信する際、フォントを多数のスライスに分割し、`unicode-range` で「そのページに必要なスライスだけ」をブラウザに取得させています。実際に配信されるCSSを数えると、Kosugi Maruは121個のスライスに分割されていました。内訳は **頻出約3,000文字を20スライス+残りをコードポイント順に約100等分** です。Googleの発表によると、この方式でフォント全体を配信する場合と比べて約80%のバイト数削減になるとされています。

https://developers.googleblog.com/google-fonts-launches-japanese-support/

これは**日本語Web全体の平均的な文字頻度に対する汎用最適化**としてはよくできた仕組みです。ただし、あくまで「平均」への最適化なので、特定のサイトの文字セットには最適化されていません。技術ブログは固有名詞や専門用語で「頻出3,000文字」の外側の漢字を広く薄く使うため、記事ごとにバラバラのスライスが大量に必要になっていました。

**自分のサイトで使う文字を知っているのは自分だけ**です。それなら、その文字だけを含む1ファイルを自分で作ればいいはずです！

#### 既製の選択肢が使えなかった理由

自作に踏み切る前に検討した選択肢と、見送った理由です。

| 選択肢 | 見送った理由 |
|------|------|
| google-webfonts-helper | japanese選択時は「日本語全部入り1ファイル」になり、分割もサブセットも再現されない |
| @fontsource/kosugi-maru | Googleの分割をミラーするだけで転送量は変わらない |
| `next/font/google` への回帰 | `japanese` サブセット未サポート（[Discussion #86336](https://github.com/vercel/next.js/discussions/86336)）。render-blockingも再発する |
| IFT（Incremental Font Transfer） | 2025年7月にW3C勧告候補になったがブラウザ実装が未完了で時期尚早 |
| 本文をシステムフォント化 | 転送量はゼロになるが、ブランドとして丸ゴシックを維持したかった |

ちなみに「Google FontsのCDNは多くのサイトで共有キャッシュされているから速い」という通説は、Chrome 86（2020年）の[HTTPキャッシュパーティショニング](https://developer.chrome.com/blog/http-cache-partitioning)以降は期待できません。キャッシュはトップレベルサイトごとに分離されたため、他サイトで取得済みのフォントが自サイトで再利用されることはありません。実際、2025年のWeb Almanacでは[約72%のサイトが自己ホストでフォントを配信している](https://almanac.httparchive.org/en/2025/fonts)と報告されています。

## 📌 フォントもビルドする方針へ

ここで冒頭の構成表を思い出してください。このブログは **MDX + Veliteで、全コンテンツがビルド時に確定します**。

つまり「ページで使われる文字の全集合」はビルド時に列挙できます。それなら、**ビルドのたびに実際に使っている文字を抽出してサブセットフォントを作り直せば、動的サブセットの一般的な弱点である「欠字」が構造的に発生しない**はずです。

- コンテンツを追加する → 次のビルドで新しい文字が自動的にサブセットへ取り込まれる
- 運用の手間はゼロ、欠字のリスクも設計上ゼロ

実装前に英語圏・日本語圏の先行事例を幅広く調査しましたが、「ビルド時に記事本文から使用文字を抽出してサブセットを生成するパイプライン」の日本語ブログ向け実装は見つかりませんでした。既製ツールがない以上、自作します！

## 📌 サブセット生成パイプラインの実装

生成スクリプトは `predev` / `prebuild` フックで自動実行される1本のNode.jsスクリプトです。サブセット化のコアには、HarfBuzzのWASMビルドを使った [subset-font](https://www.npmjs.com/package/subset-font) を採用しました。Node.js製のサブセットツールとしては現役でメンテナンスされており、TTFからwoff2への直接変換に対応しています。

パイプラインの全体像は次の5ステップです。

1. コンテンツを再帰走査して使用文字を収集する
2. 安全マージンの文字（SAFETY_CHARS）を常時含める
3. `subset-font` でTTFからwoff2を生成する
4. **内容由来ハッシュ**のファイル名で書き出す
5. CSSパスだけを記したマニフェストを生成する

コードの骨子は以下の通りです（実際のスクリプトから抜粋・簡略化しています）。

```js:scripts/generate-font-subset.mjs（抜粋・簡略化）
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import subsetFont from "subset-font";

// 1. 使用文字の収集対象（記事MDX・UI文言・翻訳・カテゴリ定義）
const SOURCES = ["content/blogs", "src", "locales", "content/categories.json"];

// 2. 安全マージン: ASCII・ひらがな・カタカナ・記号類は常時含める
//    長音「ー」U+30FCと中点「・」U+30FBは下の範囲指定（U+30A1〜U+30FA）の外なので明示指定
const SAFETY_CHARS = [
  ...range(0x0020, 0x007e), // ASCII
  ...range(0x3041, 0x3096), // ひらがな
  ...range(0x30a1, 0x30fa), // カタカナ
  0x30fb, 0x30fc, // 「・」「ー」
].map((cp) => String.fromCodePoint(cp));

const chars = new Set(SAFETY_CHARS);
for (const file of await collectFiles(SOURCES)) {
  for (const ch of await readFile(file, "utf8")) chars.add(ch);
}

// 3. TTFからwoff2サブセットを生成（HarfBuzz WASM）
const ttf = await readFile("assets/fonts/KosugiMaru-Regular.ttf");
const woff2 = await subsetFont(ttf, [...chars].join(""), {
  targetFormat: "woff2",
});

// 4. ファイル名は内容由来ハッシュ（woff2とCSSテンプレートの両方を入力にする）
const css = buildFontFaceCss(); // @font-face + フォールバックメトリクス
const hash = createHash("sha256")
  .update(woff2)
  .update(css)
  .digest("hex")
  .slice(0, 10);

await writeFile(`public/fonts/kosugi-maru-subset.${hash}.woff2`, woff2);
await writeFile(`public/fonts/kosugi-maru-subset.${hash}.css`, css);

// 5. layout.tsxが参照するのはマニフェストだけ（gitにはこれだけをコミット）
await writeFile(
  "src/generated/font-manifest.json",
  JSON.stringify({ cssPath: `/fonts/kosugi-maru-subset.${hash}.css` }),
);
```

**ポイントは内容由来ハッシュ**です。`/fonts/*` にはimmutableな長期キャッシュを設定しているため、フォントの内容が変わったらファイル名も変わる必要があります。ハッシュをファイル名に含めることでキャッシュバスティングが自動化され、旧ハッシュのファイルは生成時に削除します。生成は決定論的で、同じ入力なら2回実行しても同一ハッシュになることを確認済みです。

生成物のwoff2とCSSは **あえてgitにコミットせず、gitignoreしています**。`predev` / `prebuild` フックによりローカル開発・CI・デプロイの全経路で必ず再生成されるので、コミットする必要がないんです。記事を追加するたびに約283KBのバイナリがgit履歴に積み上がるのを避けられます。マニフェストのCSSパスだけをコミットしておけば、アプリ側のコードは常に正しいファイルを参照できます。

### 読み込み側は「preloadしない」が正解だった

読み込み機構は前述の3点セット（CSSのpreload+load後のscript挿入+noscriptフォールバック）をそのまま維持しています。`font-display: swap` とsize-adjust実績値によるCLS対策も変更なしです。

```tsx:app/layout.tsx（抜粋・簡略化）
import fontManifest from "@/generated/font-manifest.json";

// CSSはfetchPriority="low"でpreloadし、load後にstylesheetとして挿入する
<link
  rel="preload"
  as="style"
  href={fontManifest.cssPath}
  fetchPriority="low"
/>
<noscript>
  <link rel="stylesheet" href={fontManifest.cssPath} />
</noscript>
```

ここで直感に反するのが、**woff2本体のpreloadはあえて追加していない**ことです。1ファイルになったのだからpreloadで先読みしたくなりますよね。しかし前述のIssue #11460の通り、preloadしたフォントはシミュレーションLCPに算入されて逆にスコアが下がります。そもそもこのIssue自体が「preload推奨に従ったらスコアが悪化した」という報告から始まったものです。LCP画像との帯域競合を避ける意味でも、フォントはload後にゆっくり取得するのが合理的でした。

なお、Lighthouse 13（2025年10月）では `preload-fonts` 監査そのものが削除され、フォント関連の評価は[font-displayのinsight](https://developer.chrome.com/blog/lighthouse-13-0)が中心になりました。「フォントはとにかくpreload」という時代は終わりつつあるようです。

### 欠字への防御

サブセットフォントの最大のリスクは欠字です。豆腐（□）やフォールバックフォントの混在は読者に直接見えてしまうので、多層で防御しています。

**1. draft記事も収集対象に含める**

公開記事だけから文字を収集すると、draftを公開に切り替えた瞬間に欠字が発生し得ます。収集はdraft込みで行い、「公開操作でフォントが壊れる」経路を塞ぎました。

**2. 収集対象の異常はビルドを失敗させる**

将来ディレクトリ構成を変更したとき、収集対象のパスが空振りしてもエラーが出ないと、**サブセットが静かに縮んで欠字だらけになる**という最悪の壊れ方をします。そこで、収集対象ディレクトリの欠落や収集ファイル数の異常を検知したらビルド自体を失敗させるガードを入れました。

```js:scripts/generate-font-subset.mjs（ガード部分の抜粋）
if (!existsSync(dir)) {
  throw new Error(`収集対象ディレクトリが見つかりません: ${dir}`);
}
if (files.length < MIN_EXPECTED_FILES) {
  throw new Error(`収集ファイル数が想定を下回っています（設定ミスの可能性）`);
}
```

「間違ったフォントで公開される」より「ビルドが落ちて気づける」方が圧倒的にマシ、という判断です。

**3. 万一欠けてもgraceful degradationで済む**

それでも欠字が起きた場合、サブセットに含まれない文字は `font-family` で指定した次候補のフォールバックフォントで描画されるため、表示自体は継続されます。そして該当文字は次のビルドで自動的にサブセットへ取り込まれます。恒久的に壊れ続ける経路がないことが重要です。

### 注意点

**フォントのライセンスを必ず確認する**

サブセット化は改変・再配布に当たるため、ライセンス確認が必須です。Kosugi Maruは[Apache License 2.0](https://github.com/googlefonts/kosugi-maru)で提供されており、サブセット化と自己ホストは可能ですが、ライセンス本文の同梱が必要です（筆者はリポジトリのLICENSEとAUTHORSを同梱しています）。SIL OFLなど他のライセンスでは条件が異なるので、使用フォントごとに確認してください。

**フォールバックメトリクスの自作調整には手を出さない**

CLS対策のsize-adjust値は `next/font` が生成していた実績値をそのまま固定利用しています。和欧混植でのメトリクス調整は難易度が高く、[Jxck氏がascent-override等のメトリクス上書きを検証して断念した事例](https://blog.jxck.io/entries/2021-02-25/font-metrics-override.html)もあります。実績のある値を動かさないのが安全です。

**スコアと実UXは別物として扱う**

今回の出発点は「実測LCP 2.5〜4.0秒なのにスコア上は6.4〜10.0秒」という乖離の原因調査でした。Lanternの仕組みを理解してから投資判断をしたことで、「スコアのためだけの施策」ではなく実UXにも効く転送量削減に絞れました。スコアが不可解に低いときは、まずシミュレーションの癖を疑ってみてください。

**このアプローチが成立する条件**

「ビルド時に使用文字が確定する」ことが大前提です。CMSからランタイムにコンテンツを取得するサイトやユーザー投稿があるサイトでは、この方式単体では欠字が発生します。その場合は動的サブセットサービスや、頻出文字サブセット+フルセットのフォールバック構成を検討してください。

## 📌 結果

今回の改善のBefore/Afterをまとめます。

| 指標 | Before | After |
|------|------|------|
| フォント配信 | Google Fonts CDN・121分割 | 自己ホスト・**1ファイル** |
| 記事ページの取得ファイル数 | 34〜49スライス | **1** |
| フォント転送量 | 280〜631KB（漢字の種類数に比例） | **約283KB固定**（全ページ共通） |
| 含まれる文字 | フォント全グリフ（TTFで3.5MB相当） | **1,760文字種**（実使用+安全マージン） |
| 2ページ目以降の転送 | スライス構成が変わるたびに発生 | **ゼロ**（immutableキャッシュ） |
| 外部接続 | fonts.gstatic.comへのpreconnect | **不要**（同一オリジン化で撤去） |
| CLS | 0 | **0**（size-adjust実績値を維持） |
| Lighthouse Perf（最重量ページ） | 57 | **73** |
| シミュレーションFCP（最重量ページ） | 8.0s | **3.0s** |

※ PerfとFCPのBefore値は本番、After値はローカルのstandaloneビルドをLighthouse mobileで計測した値のため、厳密な同条件比較ではありません。

表の通り、フォント631KBが原因でシミュレーションFCPが8.0秒まで膨らんでいた最重量ページも大きく改善しました！記事内に含まれる全434種の漢字グリフに欠けがないことも、実際にブラウザで表示して確認しています。ちなみにサブセット生成の実行時間は1.86秒で、ビルド時間への影響は軽微でした🎉

そして運用開始から約1か月、記事の追加に合わせてサブセットは約305KBまで自動成長しています。**手作業ゼロで欠字ゼロ**を維持できており、「ビルドのたびに作り直す」設計の狙い通りに回っています。

### まとめ

今回の取り組みの要点です。

- **静的サイトならフォントは「作れる」**: コンテンツがビルド時に確定するなら、フォントもビルド成果物にできる。動的サブセットの弱点である欠字はパイプライン設計で構造的に消せる
- **Lighthouseのシミュレーションを理解すると打ち手が変わる**: Lanternの未解決Issue #11460により、フォント転送量はシミュレーションFCP/LCPに比例して乗る。乖離の正体を突き止めてから転送量削減に投資した
- **汎用最適化と自サイト最適化は別物**: Google Fontsの121分割は「日本語Webの平均」への最適化。自分のサイトの文字セットを知っているのは自分だけ
- **運用で壊れない構造を優先する**: 内容由来ハッシュ×immutableキャッシュ、draft込み収集、異常時はビルドを落とすガード、生成物の非コミット。「初回実装の正しさ」より「1年後も壊れないこと」

日本語Webフォントの重さに悩んでいる方や、Lighthouseスコアと体感の乖離に首をかしげている方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

### 参考資料

:::details 参考にした資料の一覧
- [font-display:swap fonts shouldn't affect lantern lcp · Issue #11460 · GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse/issues/11460)
- [Lighthouse 13.0 - Chrome for Developers](https://developer.chrome.com/blog/lighthouse-13-0)
- [Google Fonts launches Japanese support](https://developers.googleblog.com/google-fonts-launches-japanese-support/)
- [2025 Web Almanac - Fonts](https://almanac.httparchive.org/en/2025/fonts)
- [HTTP cache partitioning - Chrome for Developers](https://developer.chrome.com/blog/http-cache-partitioning)
- [subset-font - npm](https://www.npmjs.com/package/subset-font)
- [googlefonts/kosugi-maru - GitHub](https://github.com/googlefonts/kosugi-maru)
- [Support `japanese` subset for `next/font/google` · vercel/next.js Discussion #86336](https://github.com/vercel/next.js/discussions/86336)
- [Improved font fallbacks - Chrome for Developers](https://developer.chrome.com/blog/font-fallbacks)
- [Web Font のメトリクス上書きによる CLS の改善 | blog.jxck.io](https://blog.jxck.io/entries/2021-02-25/font-metrics-override.html)
- [Webフォントとパフォーマンスの両立を諦めない](https://zenn.dev/ivry/articles/f214469e05e427)
:::
