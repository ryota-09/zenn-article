---
title: "🔠 【Next.js / App Router】 opengraph-image.tsxのOG画像内フォントの変更方法"
emoji: "🔠"
type: "tech"
topics: ["Next.js", "App Router", "opengraph", "フォント"]
published: true
created_at: "2024-07-21T00:00:00.000Z"
published_at: "2024-07-21T00:00:00.000Z"
---

# 【Next.js / App Router】 opengraph-image.tsxのOG画像内フォントの変更方法

## 📌 Next.js(App Router)のOG画像の設定方法

Next.jsのApp Routerでは、`opengraph-image.tsx`や`twitter-image.tsx`を使用してOG画像を生成できます。`next/og`ライブラリを利用することで、オリジナルのOG画像を簡単に作成できます。

## 📌 フォントを変更する方法

### まず結論

#### ① フォントのデータをプロジェクトに格納

1. [Googleフォント](https://fonts.google.com/?subset=japanese)からフォントをダウンロード
2. ダウンロードしたフォントファイル（例：`KosugiMaru-Regular.ttf`）を`public`ディレクトリに保存

#### ② 実装

```typescript
// opengraph-image.tsx
import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  // フォントファイルを直接読み込む
  const fontData = await fs.readFileSync(path.join(process.cwd(), 'public/KosugiMaru-Regular.ttf'))
  return new ImageResponse(
    (
      <div style={{ fontFamily: 'Kosugi Maru' }}>
        <div>
          日本語: テスト てすと
        </div>
      </div>
    ),
    {
      ...size,
      // フォントデータを設定
      fonts: [
        {
          name: 'Kosugi Maru',
          data: fontData,
        }
      ],
    }
  )
}
```

### 詳細な手順

#### 1. Googleフォントからフォントをダウンロード

[Google Fonts](https://fonts.google.com/?subset=japanese)にアクセスし、使用したいフォントを選択してダウンロードします。

日本語対応フォントの例：
- Noto Sans Japanese
- Kosugi Maru
- M PLUS Rounded 1c
- などなど

#### 2. フォントファイルの配置

ダウンロードしたフォントファイル（.ttf または .woff2）をプロジェクトの`public`ディレクトリに配置します。

```
public/
  ├── fonts/
  │   └── KosugiMaru-Regular.ttf
  └── ...
```

#### 3. opengraph-image.tsxでの実装

```typescript
import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  // フォントデータの読み込み
  const kosugiMaruFont = await fs.readFileSync(
    path.join(process.cwd(), 'public/fonts/KosugiMaru-Regular.ttf')
  )

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          fontFamily: 'Kosugi Maru',
        }}
      >
        <div style={{ fontSize: 60, color: '#333' }}>
          こんにちは、世界！
        </div>
        <div style={{ fontSize: 30, color: '#666', marginTop: 20 }}>
          Next.js App Router でOG画像生成
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Kosugi Maru',
          data: kosugiMaruFont,
          style: 'normal',
        },
      ],
    }
  )
}
```

## 📌 複数フォントの使用

複数のフォントを使用する場合は、`fonts`配列に複数のフォント情報を追加します：

```typescript
const regularFont = await fs.readFileSync(path.join(process.cwd(), 'public/fonts/Regular.ttf'))
const boldFont = await fs.readFileSync(path.join(process.cwd(), 'public/fonts/Bold.ttf'))

return new ImageResponse(
  (
    <div>
      <div style={{ fontFamily: 'MyFont', fontWeight: 400 }}>
        通常のテキスト
      </div>
      <div style={{ fontFamily: 'MyFont', fontWeight: 700 }}>
        太字のテキスト
      </div>
    </div>
  ),
  {
    ...size,
    fonts: [
      {
        name: 'MyFont',
        data: regularFont,
        style: 'normal',
        weight: 400,
      },
      {
        name: 'MyFont',
        data: boldFont,
        style: 'normal',
        weight: 700,
      },
    ],
  }
)
```

## 📌 注意点

### パフォーマンス

- フォントファイルのサイズに注意（特に日本語フォント）
- 必要な文字セットのみを含むサブセットフォントの使用を検討
- キャッシュの活用

### ファイルパス

- `fs.readFileSync`を使用する際のパスに注意
- `process.cwd()`を使用して正確なルートパスを取得

### エラーハンドリング

```typescript
try {
  const fontData = await fs.readFileSync(
    path.join(process.cwd(), 'public/fonts/font.ttf')
  )
  // フォント使用の処理
} catch (error) {
  console.error('フォントファイルの読み込みに失敗:', error)
  // フォールバック処理
}
```

## 📝 まとめ

Next.js App Routerでのopengraph-image.tsxにおけるフォント変更は：

1. フォントファイルをプロジェクトに配置
2. `fs.readFileSync`でフォントデータを読み込み
3. `ImageResponse`の`fonts`オプションに設定

この手順で、オリジナルフォントを使用したOG画像を生成できます。日本語フォントを使用する場合は、ファイルサイズとパフォーマンスに注意しながら実装しましょう。