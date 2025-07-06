# ZennのMarkdown記法一覧

この記事では **Zenn** で使える Markdown 記法を一覧で紹介します。

---

## 見出し

```
# 見出し1
## 見出し2
### 見出し3
#### 見出し4
```

アクセシビリティの観点から 見出し2 から始めることをおすすめします。

⸻

リスト

```
- Hello!
- Hola!
  - Bonjour!
  * Hi!
```

リストのアイテムには * もしくは - を使います。

⸻

番号付きリスト
```
1. First
2. Second
```

⸻

テキストリンク

[アンカーテキスト](リンクのURL)

Markdown エディタでは、テキストを範囲選択した状態で URL をペーストすると選択範囲がリンクになります。

⸻

画像

```
![](https://画像のURL)
```

画像の横幅を指定する

```
![](https://画像のURL =250x)
```

Alt テキストを指定する
```
![Altテキスト](https://画像のURL)
```
キャプションをつける
```
![](https://画像のURL)
*キャプション*
```
画像にリンクを貼る
```
[![](画像のURL)](リンクのURL)
```

⸻

テーブル
```
| Head | Head | Head |
| ---- | ---- | ---- |
| Text | Text | Text |
| Text | Text | Text |
```

⸻

コードブロック

コードは「```」で挟むことでブロックとして挿入できます。言語を指定するとシンタックスハイライトが適用されます（Prism.js を使用）。

```javascript
const great = () => {
  console.log("Awesome");
};
```

ファイル名を表示する

```javascript
const great = () => {
  console.log("Awesome");
};
```

diff のシンタックスハイライト

```diff
@@ -4,6 +4,5 @@
-  const foo = bar.baz([1, 2, 3]) + 1;
+  let foo = bar.baz([1, 2, 3]);
```

⸻

数式

Zenn では KaTeX による数式表示に対応しています。

数式のブロックを挿入する

```
$$
e^{i\theta} = \cos\theta + i\sin\theta
$$
```

インラインで数式を挿入する

```
$a\ne0$
```

⸻

引用

```
> 引用文
> 引用文
```

⸻

脚注


脚注の例[^1]です。インライン^[脚注の内容その2]で書くこともできます。

```
[^1]: 脚注の内容その1
```

⸻

区切り線

```
-----
```

⸻

インラインスタイル

```
*イタリック*
**太字**
~~打ち消し線~~
インラインで`code`を挿入する
```

⸻

インラインのコメント

```
<!-- TODO: ◯◯について追記する -->
```
この形式で書いたコメントは公開されたページ上では表示されません。複数行のコメントには対応していません。

⸻

Zenn 独自の記法

メッセージ
```
:::message
メッセージをここに
:::
```

```
:::message alert
警告メッセージをここに
:::
```

アコーディオン（トグル）

```
:::details タイトル
表示したい内容
:::
```

ネストさせる場合:
```
::::details タイトル
:::message
ネストされた要素
:::
::::
```

⸻

コンテンツの埋め込み

リンクカード

URL だけが貼り付けられた行があるとカードとして表示されます。
```
https://zenn.dev/zenn/articles/markdown-guide
```
```
@[card](URL) の形式でも可。
```
X（Twitter）のポスト

https://x.com/jack/status/20

リプライ元を非表示にする場合は ?conversation=none を付与します。

YouTube

https://www.youtube.com/watch?v=WRVsOCh907o

GitHub

GitHub のファイル URL だけの行を貼ると埋め込みが表示されます。行番号も指定可能です。

https://github.com/octocat/Hello-World/blob/master/README.md#L1-L3

GitHub Gist

@[gist](https://gist.github.com/foo/bar)

ファイルを指定する場合:

@[gist](https://gist.github.com/foo/bar?file=example.json)

CodePen・SlideShare・SpeakerDeck・Docswell・JSFiddle・CodeSandbox・StackBlitz・Figma

それぞれ次のように書きます（例）:

@[codepen](URL)
@[slideshare](key)
@[speakerdeck](ID)
@[docswell](URL)
@[jsfiddle](URL)
@[codesandbox](embed用のURL)
@[stackblitz](embed用のURL)
@[figma](URL)

ダイアグラム（mermaid.js）

graph TB
    A[Hard edge] -->|Link text| B(Round edge)
    B --> C{Decision}
    C -->|One| D[Result one]
    C -->|Two| E[Result two]

制限事項
	•	クリックイベントは無効化
	•	ブロック 1 つにつき 2000 文字以内
	•	& の使用は 10 個まで

⸻

入力補完
	•	: の後に 1 文字入力で Emoji 候補が表示されます。

⸻

絵文字（Emoji）の例

:smile: → 😄

⸻

（以上）

