---
title: "【初学者向け】Alembicでマテリアライズドビューを実装する (Python)"
emoji: "📝"
type: "tech"
topics: ["Python"]
published: true
created_at: "2025-05-27T06:11:09.082Z"
published_at: "2025-05-27T06:20:59.842Z"
---

Alembicによるマテリアライズドビュー(マテビュー)の作成手順をPythonとPostgreSQLを用いて初心者向けに解説。SQLの実装例やトラブル時の対処法も掲載。

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です!☺️  

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。  

今回は **alembicでマテリアライズドビューを実装する方法** を紹介していきます！

## マテリアライズドビューとは？

マテリアライズドビュー（Materialized View）は、データベース上にあらかじめクエリ結果を保持しておく「キャッシュテーブル」のような仕組みです。  

通常のビュー（VIEW）は基となるテーブルを参照してクエリを毎回実行しますが、マテリアライズドビューは一度集計結果を作成すると、その後は高速に結果を返せるメリットがあります。

**メリット**  

- 集計処理や複雑な結合クエリの高速化  
- 再生成（REFRESH）タイミングを制御できる  

**デメリット**  

- データの更新タイミングが遅延する（REFRESHが必要）  
- ストレージ容量を消費する  

特にログ集計やダッシュボード用の集計結果など、頻繁に読み取りのみ行うケースで威力を発揮します。

## alembicでの実装方法

Python製のマイグレーションツールである **alembic** を使って、マテリアライズドビューを管理する流れをご紹介します。  

ポイントは、生成されたバージョンファイルの `upgrade()` 関数内で直接 SQL を発行することです。

1. **バージョンファイルの作成**

```bash
alembic revision -m "create materialized view for daily_usage"
```

すると alembic/versions/xxxxx_create_materialized_view_for_daily_usage.py が生成されます。

2.**upgrade関数内でビュー作成**

生成されたファイルを開き、`upgrade()` の中身を以下のように編集します。

```python:aiembic/xxxx.py
from alembic import op
# revision identifiers, used by Alembic.
revision = 'xxxxx'
down_revision = 'yyyyy'
branch_labels = None
depends_on = None

def upgrade() -> None:

    # 既存のビューを削除してから作成（CASCADEで依存関係も破棄）
    op.execute("""
    DROP MATERIALIZED VIEW IF EXISTS daily_usage_matview CASCADE;
    CREATE MATERIALIZED VIEW daily_usage_matview AS
    SELECT
        user_id,
        date_trunc('day', created_at AT TIME ZONE 'Asia/Tokyo')::date AS target_date,
        COUNT(*) AS usage_count
    FROM message_usages
    GROUP BY user_id, target_date;
    """)

def downgrade() -> None:
    # ダウングレード時にはビューを削除
    op.execute("DROP MATERIALIZED VIEW IF EXISTS daily_usage_matview;")
```

•	op.execute("""…""") で複数行の SQL を直接実行
•	DROP MATERIALIZED VIEW IF EXISTS … CASCADE で既存のビューや依存オブジェクトをまとめて削除
•	CREATE MATERIALIZED VIEW … AS SELECT … で集計クエリを登録

3.**マイグレーション実行**

```bash
alembic upgrade head
```

これでデータベースにマテリアライズドビューが作成されます。

## 注意点

マテリアライズドビューを運用する際のポイントとトラブルシューティングです。

- **REFRESHのタイミング**

マテリアライズドビューは作成後のデータ更新を自動では反映しません。最新化したい場合は以下の SQL を実行する必要があります。

REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_matview;

└ CONCURRENTLY を指定すると読み取りを止めずに更新可能ですが、PostgreSQL の設定で max_locks_per_transaction の増強が必要になる場合があります。

- **インデックスの作成**

ビュー上にインデックスを貼ると検索性能が向上します。マイグレーション内で以下を追加しましょう。

op.execute("CREATE INDEX idx_daily_usage_user_date ON daily_usage_matview (user_id, target_date);")

- **トランザクション制約**

PostgreSQL の一部バージョンでは、マテリアライズドビュー作成がトランザクション内で制限される場合があります。Troubleshooting を参照し、必要であれば op.get_bind().execution_options(isolation_level="AUTOCOMMIT") を利用してください。

- **ダウングレード時の依存関係**

他のビューや外部キーがマテリアライズドビューに依存している場合、CASCADE オプションを付けないと DROP が失敗します。

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺

> 自分がアサインしているチームで自分の記事が引用される、っていう実績を解除した🥳