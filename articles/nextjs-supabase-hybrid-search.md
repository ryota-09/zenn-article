---
title: "Supabase + OpenAIでハイブリッド検索を実装する方法"
emoji: "🔍"
type: "tech"
topics: ["nextjs", "supabase", "openai", "search", "UX"]
published: true
---


こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。今回は **Supabase + OpenAIでハイブリッド検索を実装する方法** を紹介していきます！

## 📌 背景

ChatGPTのチャット履歴検索を行うと、最初の数件のみ表示され、その後に遅れて多くの検索結果が表示されます。内部の実装は不透明ではありますが、この実装を真似できないかと思い、今回試してみました！SupabaseのpgvectorとPostgreSQLの全文検索を組み合わせて、全文検索と意味検索を行います。

![](https://storage.googleapis.com/zenn-user-upload/42e4ac3db07d-20251025.gif)

## 📌 全体の流れ

```
ユーザー入力
    ↓
[並列リクエスト]
    ├─→ 全文検索API → PostgreSQL全文検索 → 即座に表示
    └─→ セマンティック検索API → 入力内容を OpenAI Embedding でベクトル化 → pgvector類似度検索 → 後から表示
```

:::message
**フロントエンド**
- Next.js 16 (App Router)
- React 19
- SWR

**バックエンド・データベース**
- Supabase (PostgreSQL + pgvector)
- OpenAI API (text-embedding-3-small)

**主要ライブラリ**

| ライブラリ | バージョン |
| --- | --- |
| @supabase/supabase-js | ^2.76.1 |
| openai | ^6.7.0 |
| swr | ^2.3.6 |
| next | 16.0.0 |

:::

## 📌 Supabaseのセットアップ

### 1. 拡張機能の有効化

Supabaseダッシュボードで`pgvector`を有効化します。

1. Supabaseプロジェクトにログイン
2. **Database** > **Extensions**
3. `vector`を検索してONにする

### 2. テーブル作成

SupabaseダッシュボードでSQLを実行してテーブルを作成します。
いつも思いますが、SupabaseのSQL Editorはうまくできているなぁと感心しますー！

**操作手順：**
1. Supabaseダッシュボードにログイン
2. **SQL Editor** を開く（左サイドバーから選択）
3. **New query** ボタンをクリック
4. 以下のSQLを貼り付けて **Run** ボタンをクリック

```sql
-- pgvector拡張を有効化
create extension if not exists vector;

-- 記事テーブルを作成
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  embedding vector(1536) -- OpenAI text-embedding-3-smallの次元数
);

-- 全文検索用のtsvectorカラムを追加
alter table articles add column if not exists search_tsv tsvector;
```


### 3. 全文検索用トリガーの設定

同じくSQL Editorで以下のSQLを実行してトリガーを設定します。

```sql
-- tsvectorを自動更新するトリガー関数
create or replace function articles_tsv_trigger() returns trigger as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.content,'')), 'B');
  return new;
end
$$ language plpgsql;

-- トリガーを作成
drop trigger if exists tsv_update on articles;
create trigger tsv_update
before insert or update on articles
for each row execute procedure articles_tsv_trigger();
```

ポイントとしては`setweight`で`title`を'A'、`content`を'B'の重みづけを表し、タイトルの方が高い重要度で検索されるようにしています。


### 4. インデックスの作成

引き続きSQL Editorで検索用のインデックスを作成します。

```sql
-- 全文検索用GINインデックス
create index if not exists idx_articles_tsv
  on articles using gin(search_tsv);

-- ベクトル検索用IVFFlatインデックス
create index if not exists idx_articles_embedding
  on articles using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

### 5. ハイブリッド検索関数の作成

最後に、ハイブリッド検索を実行する関数を作成します。

```sql
create or replace function public.hybrid_search(
  query_text text,
  query_embedding vector(1536)
) returns table(
  id uuid,
  title text,
  content text,
  hybrid_score double precision
)
language sql as $$
  select
    id,
    title,
    content,
    (
      0.6 * ts_rank_cd(search_tsv, plainto_tsquery('simple', query_text))
      + 0.4 * coalesce(1 - (embedding <=> query_embedding), 0)
    ) as hybrid_score
  from articles
  order by hybrid_score desc
  limit 10;
$$;
```

**スコアの重み付け：**
- 全文検索: 60%
- ベクトル類似度: 40%
- `coalesce`でembeddingがnullの場合も対応

この比率は用途に応じて調整できます！

### 6. Row Level Security (RLS)

セキュリティ設定も必要です！
こちらはプロジェクトの要件に応じて調整してください。今回は匿名ユーザーでも記事を閲覧できるように設定します。

```sql
-- RLSを有効化
alter table articles enable row level security;

-- 読み取り専用ポリシー（匿名ユーザーでも閲覧可能）
create policy "read public articles"
on articles
for select
to public
using (true);
```

あとは、記事データを投入すればOKです！
今回はサンプルとして、似たようなエンジニアの職種をシードデータとして投入しました。
例:エンジニア、コーダー、プログラマー、SEなど


これでSupabase側のセットアップは完了です！🎉

## 📌 Next.jsアプリケーションの実装

### プロジェクト構造

```
hyblid-search/
├── app/
│   ├── api/
│   │   └── search/
│   │       ├── fulltext/route.ts    # 全文検索API
│   │       └── semantic/route.ts    # セマンティック検索API
│   ├── search/
│   │   └── page.tsx                 # 検索UI
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   └── fetchers.ts                  # SWR用フェッチャー
├── scripts/
│   └── update-embeddings.ts         # embedding更新スクリプト
└── .env.local                       # 環境変数
```

### 1. Embedding更新スクリプト

記事テーブルでは、はじめにembeddingがnullの状態なので、OpenAI APIを使ってembeddingを生成し、Supabaseに保存するスクリプトを作成します。これを行わないとhybrid_scoreが常にnullになってしまいます。自分はこちらの設定を行っていなかったので、意味検索の結果がずっと変わらなくて困ってました😇


**`scripts/update-embeddings.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.localを読み込み
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // embeddingの更新にはサービスロールキーが必要
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function updateEmbeddings() {
  console.log('Fetching documents...');
  const { data: documents, error } = await supabase
    .from('articles')
    .select('id, title, content');

  if (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }

  console.log(`Found ${documents.length} documents. Updating embeddings...`);

  for (const doc of documents) {
    console.log(`Processing: ${doc.title}`);

    // OpenAI APIでembeddingを生成
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: doc.content ?? '',
    });

    const embedding = embeddingResponse.data[0].embedding;

    // Supabaseに保存
    const { error: updateError } = await supabase
      .from('articles')
      .update({ embedding })
      .eq('id', doc.id);

    if (updateError) {
      console.error(`Error updating ${doc.title}:`, updateError);
    } else {
      console.log(`✓ Updated ${doc.title}`);
    }
  }

  console.log('All embeddings updated successfully!');
}

updateEmbeddings().catch(console.error);
```

**実行方法：**

```bash
## ターミナル
npm install dotenv
npx tsx scripts/update-embeddings.ts
```

このスクリプトで既存の記事にembeddingを追加できます！

### 2. 全文検索API

**`app/api/search/fulltext/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  // Supabaseの全文検索機能を使用
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .textSearch("content", query, {
      type: "websearch",
      config: "simple"
    })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}
```

### 3. セマンティック検索API

**`app/api/search/semantic/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // RPC呼び出しにはサービスロールキーが必要
);

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  // OpenAI APIでクエリをembeddingに変換
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingRes.data[0].embedding;

  // Supabaseのハイブリッド検索関数を呼び出し
  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: query,
    query_embedding: queryEmbedding,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}
```

### 残りのフロントエンドの実装

:::details UIなどの実装

### 4. フェッチャー関数

**`lib/fetchers.ts`**

```typescript
export async function postFetcher(url: string, { arg }: { arg: unknown }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
    cache: "no-store", // Next.jsのキャッシュを無効化
  });
  if (!res.ok) throw new Error("API error");
  return res.json();
}
```

### 5. 検索UI

**`app/search/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import useSWRMutation from "swr/mutation";
import { postFetcher } from "@/lib/fetchers";

type Article = { id: string; title: string; content: string };

export default function SearchPage() {
  const [query, setQuery] = useState("");

  // 全文検索用のSWR mutation
  const { data: fulltextData, isMutating: fulltextLoading, trigger: triggerFulltext } = useSWRMutation(
    "/api/search/fulltext",
    postFetcher
  );

  // セマンティック検索用のSWR mutation
  const { data: semanticData, isMutating: semanticLoading, trigger: triggerSemantic } = useSWRMutation(
    "/api/search/semantic",
    postFetcher
  );

  const fulltextResults: Article[] = fulltextData?.results || [];
  const semanticResults: Article[] = semanticData?.results || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 並列で両方のAPIを呼び出し
    triggerFulltext({ query });
    triggerSemantic({ query });
  };

  return (
    <div className="p-6 space-y-6 mx-auto max-w-xl">
      <h1 className="text-xl font-bold">ハイブリッド検索</h1>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="border px-2 py-1 w-80"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索ワードを入力"
        />
        <button className="bg-blue-500 text-white px-3 py-1 rounded">
          検索
        </button>
      </form>

      {/* 全文検索結果 */}
      <section>
        <h2 className="font-semibold my-4">📝全文検索結果</h2>
        {fulltextLoading && <p>🔍 検索中...</p>}
        <ul>
          {fulltextResults.map((r) => (
            <li key={r.id} className="border-b py-2">
              <strong>{r.title}</strong>
            </li>
          ))}
        </ul>
      </section>

      {/* セマンティック検索結果 */}
      {semanticLoading && <p>💡 意味的類似を解析中...</p>}
      {semanticResults.length > 0 && (
        <section>
          <h2 className="font-semibold my-4">💡セマンティック検索結果</h2>
          <ul>
            {semanticResults.map((r) => (
              <li key={r.id} className="border-b py-2">
                <strong>{r.title}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

:::

## 📌 ハマったポイントと解決策

実装する中でハマったポイントがあったので共有します！

### セマンティック検索の結果が常に同じ

どのキーワードでも結果がかわらず同じ結果が返ってくるので困ってました。
調べたところ、`articles`テーブルの`embedding`カラムがnullだったのが原因でした。
embeddingの登録が必要です。`update-embeddings.ts`スクリプトを実行してください！

**確認クエリ**
```sql
SELECT id, title,
       embedding IS NOT NULL as has_embedding,
       array_length(embedding::float[], 1) as dimension
FROM articles
LIMIT 5;
```
そういうわけで、手順の「1. Embedding更新スクリプト」が必要になります。


## 📌 まとめ

ハイブリッド検索を実装することで、キーワードマッチの速さと意味検索の精度を両立できそうです！データが多ければ多いほどUXの良さを感じられると思います。

同じような検索機能を実装したい方の参考になれば幸いです！
最後まで読んでいただきありがとうございます！
気ままにつぶやいているので、気軽にフォローをお願いします！🥺

https://x.com/Ryo54388667

参考資料

- [Supabase Vector Documentation](https://supabase.com/docs/guides/ai/vector-columns)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
