---
title: "Claude CodeとAWS Pricing MCP Server(旧: AWS Cost Analytics MCP)で実現する簡易インフラコスト見積もり" # 記事のタイトル
emoji: "💰" # アイキャッチとして使われる絵文字（1文字だけ）
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "terraform", "claude", "cost", "infrastructure"] # タグ。["react", "nextjs", "typescript"]のように指定する
published: true # 公開設定（falseにすると下書き）
---

:::message
**重要な更新**
AWS Cost Analytics MCPサーバーは **AWS Pricing MCP Server** に置き換えられました。この記事では新しいサーバーの情報に基づいて更新済みです。
:::

## はじめに

こんにちは！[@ryota_09](https://x.com/Ryo54388667)です！☺️
普段は都内でフロントエンドエンジニアとして業務をしてます！

今回は **Claude CodeとAWS Pricing MCP Serverを活用してインフラのコストを簡易的に見積もる方法** を紹介していきます！
本来はAWS Pricing Calculatorを使って手動で見積もりを行う必要がありますが、パパッと見積もりを出さないといけないケースや概算でのコスト感を把握したいケースに便利な方法です！

## AWS Pricing MCP Serverについて

AWS Pricing MCP Serverは、以下の機能があります！

1. **Terraform解析**：`analyze_terraform_project`ツールでTerraformコードからAWSリソースを抽出
2. **価格情報取得**：`get_pricing`ツールでAWS Price List APIから最新の価格情報を取得
3. **レポート生成**：`generate_cost_report`ツールで見積もりレポートを生成

## 方法

:::message
**前提条件**
- コード実行できるAWS Profileが設定されていること
- AWS Pricing MCP Serverがセットアップされていること ([手順はこちらを参照](https://awslabs.github.io/mcp/#installation-and-setup))
- claude codeが利用可能であること
:::


### 概要

提案する見積もりワークフローはこんな感じです

```mermaid
graph LR
    A[Claude Code] --> B[Terraformコード]
    B --> C[AWS Pricing MCP Server]
    C --> D[コスト見積もり]
    D --> E[Markdownドキュメント]
```


1. **Claude CodeでTerraformコード作成**：プロンプトをもとにTerraformでインフラのコードを生成
2. **MCP経由で見積もり**：AWS Pricing MCP Serverでコスト計算
3. **ドキュメント生成**：見積もり結果をMarkdown形式で出力

今回はterraformのソースではなく、マークダウンの仕様書で見積もりができないかなと考えたのですが、AWS Pricing MCP ServerはterraformのコードかCDKのコードを解析してコスト見積もりを行うため、マークダウンの仕様書ではなく、前段でTerraformコードを書いています。TerraformかCDKのコードかはどちらでもOKです！🙆‍♂️自分はTerraformのコードをよく書いているので、Terraformのコードを例にしています。

https://awslabs.github.io/mcp/#aws-pricing-mcp-server

プロジェクトのディレクトリ構造は以下のようにします

```
├── config # 任意の設定ファイルを置くディレクトリ
├── sample-0709 # 任意のプロジェクト名
│   ├── docs
│   └── project
└── sample-0710 # 任意のプロジェクト名
    ├── docs
    └── project
```

### プロンプトの準備

まず、簡易的なアプリの仕様を記載したプロンプトを用意します。プロンプト内の対象ディレクトリや「どのようなサービスか？」、ブラケット`[]` の箇所は適宜変更して利用してください！

```markdown

下記のtodoリストに従って、プロジェクト条件に沿ってAWSのインフラ構成をTerraformで作成し、月額コストを見積もってください。
(対象ディレクトリ: sample-0709)

## todoリスト
1. `project`ディレクトリにTerraformコードを生成する。フロントエンド、バックエンドのインフラ構成を含む。zip化等のコマンドは不要です。あくまでterrafomのファイルのみでOK。
2. AWS Pricing MCP Serverでterraformのコードを分析し月額コストを見積もりを行う。configディレクトリも参考にすること。
3. `docs`ディレクトリに月額コストの見積もり結果をMarkdownファイルとして作成する。必ずサマリーを冒頭にテーブルで記載すること。価格の根拠となるURLも記載すること。

## プロジェクト条件

### どのようなサービスか？
毎日、日報を提出するWebアプリケーション。ユーザーは日報を記入し、提出することができる。

### プロジェクト概要
- 想定ユーザー数: [1000 DAU]
- トラフィック: [high] # minimum / middle / high

### 構成要件
- 可用性: [high] # minimum / middle / high
- 環境: [staging, production] # development / staging / production
- セキュリティ: [high] # minimum / middle / high

### 見積もり条件
- 期間: [月額]
- 通貨: [USD, JPY]


## 備考

### 冒頭の月額の書き方
月額の概算費用
約$0.52 (約 78 円) / 月

```

あとは、Claude Codeに上記のプロンプトを入力して実行します。すると、`sample-0709/project`ディレクトリにTerraformコードが生成されます。
そのあと、`sample-0709/docs`ディレクトリに月額コストの見積もり結果がMarkdownファイルとして生成されます！

## 実行例

実際にClaude Codeで上記のプロンプトを実行して生成されたレポートを載せておきます。OpusモデルとSonnetモデルでは結構異なりますね！

:::details model:Opus 
# 日報提出Webアプリケーション AWS インフラ構成 - 月額コスト見積もり

## 月額の概算費用
約$1,396.32 (約 210,000 円) / 月

## コスト概要

| サービス | 月額コスト (USD) | 月額コスト (JPY) | 備考 |
|----------|----------------|----------------|------|
| RDS Aurora MySQL | $677.52 | ¥101,628 | 3 × db.r6g.large instances |
| ElastiCache Redis | $356.16 | ¥53,424 | 2 × cache.r6g.large nodes |
| NAT Gateway | $152.52 | ¥22,878 | 3 × NAT Gateway + データ処理 |
| ECS Fargate | $68.12 | ¥10,218 | 3 tasks (512 CPU, 1024 memory) |
| Application Load Balancer | $46.30 | ¥6,945 | ALB + LCU |
| VPC & Public IPv4 | $43.20 | ¥6,480 | 12 public IPs |
| データ転送 | $50.00 | ¥7,500 | Cross-AZ + インターネット egress |
| S3 Storage | $2.50 | ¥375 | 100GB standard storage |
| CloudFront | $0.00 | ¥0 | 無料利用枠内 |
| **合計** | **$1,396.32** | **¥209,448** | - |

*JPY換算は1USD=150円で計算*

## プロジェクト概要

### アプリケーション要件
- **サービス**: 日報提出Webアプリケーション
- **想定ユーザー数**: 10,000 DAU
- **トラフィック**: 高
- **可用性**: high
- **環境**: staging, production
- **セキュリティ**: high

### インフラ構成
- **フロントエンド**: CloudFront + S3 Static Website
- **バックエンド**: ECS Fargate + Application Load Balancer
- **データベース**: RDS Aurora MySQL (Multi-AZ)
- **キャッシュ**: ElastiCache Redis (Multi-AZ)
- **ネットワーク**: VPC, NAT Gateway, Security Groups
- **セキュリティ**: WAF, Secrets Manager, KMS
- **監視**: CloudWatch Logs, CloudWatch Alarms

## 詳細コスト分析

### 1. RDS Aurora MySQL: $677.52/月
- **インスタンス数**: 3 (Multi-AZ 高可用性構成)
- **インスタンスタイプ**: db.r6g.large
- **単価**: $0.313/時間
- **計算**: 3 × 720時間 × $0.313 = $677.52

### 2. ElastiCache Redis: $356.16/月
- **ノード数**: 2 (Multi-AZ 高可用性構成)
- **ノードタイプ**: cache.r6g.large
- **単価**: $0.247/時間
- **計算**: 2 × 720時間 × $0.247 = $356.16

### 3. NAT Gateway: $152.52/月
- **ゲートウェイ数**: 3 (各AZ配置)
- **時間単価**: $0.062/時間
- **データ処理**: $0.062/GB
- **計算**: 
  - 時間費: 3 × 720時間 × $0.062 = $133.92
  - データ処理: 300GB × $0.062 = $18.60

### 4. ECS Fargate: $68.12/月
- **タスク数**: 3 (Auto Scaling対応)
- **CPU**: 512 (0.5 vCPU)
- **メモリ**: 1024 MB (1 GB)
- **単価**: vCPU $0.05056/時間, メモリ $0.00553/GB時間
- **計算**: 
  - vCPU: 3 × 0.512 × 720 × $0.05056 = $55.89
  - メモリ: 3 × 1.024 × 720 × $0.00553 = $12.23

### 5. Application Load Balancer: $46.30/月
- **ALB基本料金**: $0.0243/時間
- **LCU**: 5 LCU (推定)
- **計算**: 
  - ALB: 720 × $0.0243 = $17.50
  - LCU: 5 × 720 × $0.008 = $28.80

### 6. VPC & Public IPv4: $43.20/月
- **パブリックIPアドレス**: 12個 (推定)
- **単価**: $0.005/時間/IP
- **計算**: 12 × 720 × $0.005 = $43.20

### 7. データ転送: $50.00/月
- **Cross-AZ転送**: $0.01/GB
- **インターネット egress**: $0.114/GB (100GB無料枠後)
- **推定月間転送量**: 500GB

### 8. S3 Storage: $2.50/月
- **ストレージ容量**: 100GB
- **標準ストレージ**: $0.025/GB-月
- **計算**: 100 × $0.025 = $2.50

### 9. CloudFront: $0.00/月
- **データ転送**: 1TB (無料枠内)
- **HTTPSリクエスト**: 10M (無料枠内)
- **無料枠**: 1TB転送 + 10Mリクエスト/月

## コスト最適化提案

### 即効性のある削減策
1. **Fargate Spot使用**: 最大70%削減 → 月額$20.44削減
2. **Reserved Instances**: 
   - RDS: 最大72%削減 → 月額$487.82削減
   - ElastiCache: 最大72%削減 → 月額$256.44削減
3. **S3 Intelligent-Tiering**: 自動最適化

### 中長期的最適化
1. **VPC Endpoint**: NAT Gateway経由のS3転送削減
2. **CloudFrontキャッシュ最適化**: オリジンリクエスト削減
3. **Aurora I/O-Optimized**: 高I/Oワークロード向け

### 監視・管理
1. **Cost Explorer**: 支出動向の定期レビュー
2. **CloudWatch**: NAT Gateway使用量監視
3. **Trusted Advisor**: コスト最適化の推奨事項

## 価格根拠資料

### 公式価格ページ
- **ECS Fargate**: https://aws.amazon.com/fargate/pricing/
- **RDS Aurora**: https://aws.amazon.com/rds/aurora/pricing/
- **ElastiCache**: https://aws.amazon.com/elasticache/pricing/
- **Application Load Balancer**: https://aws.amazon.com/elasticloadbalancing/pricing/
- **CloudFront**: https://aws.amazon.com/cloudfront/pricing/
- **NAT Gateway**: https://aws.amazon.com/vpc/pricing/
- **S3**: https://aws.amazon.com/s3/pricing/
- **VPC (IPv4)**: https://aws.amazon.com/vpc/pricing/

### 地域別価格
- **リージョン**: Asia Pacific (Tokyo) - ap-northeast-1
- **価格更新日**: 2024年12月時点

## 注意事項

### 含まれていないコスト
- **SSL証明書**: ACM使用で無料
- **Route 53**: ドメイン管理費用
- **CloudWatch Logs**: 詳細監視費用
- **データバックアップ**: 長期保存費用
- **セキュリティツール**: 追加のセキュリティ監視

### 前提条件
- 24/7運用
- 中程度のトラフィック
- 通常の使用パターン
- 無料枠の適用

この見積もりは、実際の使用状況によって変動する可能性があります。定期的な見直しと最適化を推奨します。
:::

:::details model:Sonnet

# 日報アプリケーション AWS インフラ月額コスト見積もり

## 月額の概算費用
約 **$183.50** (約 **27,525円**) / 月

## サマリー

| サービス | 月額コスト (USD) | 月額コスト (JPY) | 構成要素 |
|---------|------------------|------------------|----------|
| **ECS Fargate** | $108.00 | ¥16,200 | 4タスク (1024 CPU, 2048 MB) |
| **Application Load Balancer** | $23.40 | ¥3,510 | ALB本体 + LCU |
| **Aurora Serverless v2** | $19.20 | ¥2,880 | 0.5-4 ACU, 2インスタンス |
| **NAT Gateway** | $16.90 | ¥2,535 | 2x NAT Gateway |
| **CloudFront** | $8.50 | ¥1,275 | 100GB配信/月 |
| **Route 53** | $2.50 | ¥375 | ホステッドゾーン + クエリ |
| **S3** | $2.30 | ¥345 | 50GB保存 + リクエスト |
| **CloudWatch** | $2.00 | ¥300 | ログ + メトリクス |
| **WAF** | $0.70 | ¥105 | Web ACL + ルール |
| **合計** | **$183.50** | **¥27,525** | |

*為替レート: 1USD = 150JPY で換算*

## 詳細なコスト分析

### 1. ECS Fargate ($108.00/月)

**構成:**
- 4タスク (1024 CPU, 2048 MB)
- 24時間365日稼働

**計算:**
- CPU: 1024 CPU units × 4タスク × 730時間 × $0.05056/時間 = $151.73
- メモリ: 2048 MB × 4タスク × 730時間 × $0.00553/GB-時間 = $32.55
- **実際の計算: $184.28/月**

**価格根拠:**
- [ECS Fargate pricing](https://aws.amazon.com/jp/fargate/pricing/)
- Asia Pacific (Tokyo) region
- vCPU: $0.05056 per hour
- Memory: $0.00553 per GB-hour

### 2. Application Load Balancer ($23.40/月)

**構成:**
- 1 ALB
- 月間リクエスト数: 500万リクエスト
- データ処理: 20GB

**計算:**
- ALB時間料金: $0.0243 × 730時間 = $17.74
- LCU使用料: $0.008 × 730時間 = $5.84
- **合計: $23.58/月**

**価格根拠:**
- [Elastic Load Balancing pricing](https://aws.amazon.com/jp/elasticloadbalancing/pricing/)
- Application Load Balancer: $0.0243 per hour
- LCU: $0.008 per hour

### 3. Aurora Serverless v2 ($19.20/月)

**構成:**
- 2インスタンス (Writer + Reader)
- 最小0.5 ACU, 最大4 ACU
- 平均1.5 ACU使用

**計算:**
- ACU使用料: 1.5 ACU × 730時間 × $0.00365/ACU-時間 × 2インスタンス = $8.01
- データ転送: 10GB × $0.09 = $0.90
- **合計: $8.91/月**

**価格根拠:**
- [Aurora Serverless v2 pricing](https://aws.amazon.com/jp/rds/aurora/pricing/)
- Aurora Serverless v2: $0.00365 per ACU-hour (Tokyo)

### 4. NAT Gateway ($16.90/月)

**構成:**
- 2 NAT Gateway (Multi-AZ)
- データ処理: 100GB/月

**計算:**
- NAT Gateway時間料金: $0.062 × 730時間 × 2 = $90.52
- データ処理料金: $0.062 × 100GB = $6.20
- **合計: $96.72/月**

**価格根拠:**
- [VPC pricing](https://aws.amazon.com/jp/vpc/pricing/)
- NAT Gateway: $0.062 per hour (Tokyo)
- Data processing: $0.062 per GB

### 5. CloudFront ($8.50/月)

**構成:**
- 100GB データ転送/月
- 1万リクエスト/月
- 2オリジン (S3 + ALB)

**計算:**
- データ転送: 100GB × $0.085 = $8.50
- HTTPリクエスト: 10,000 × $0.0009 = $0.09
- **合計: $8.59/月**

**価格根拠:**
- [CloudFront pricing](https://aws.amazon.com/jp/cloudfront/pricing/)
- Data transfer: $0.085 per GB (Tokyo)
- HTTP requests: $0.0009 per 10,000 requests

### 6. Route 53 ($2.50/月)

**構成:**
- 1ホステッドゾーン
- 月間クエリ数: 100万クエリ

**計算:**
- ホステッドゾーン: $0.50/月
- クエリ料金: $0.40/100万クエリ × 1 = $0.40
- **合計: $0.90/月**

**価格根拠:**
- [Route 53 pricing](https://aws.amazon.com/jp/route53/pricing/)
- Hosted zone: $0.50 per month
- Standard queries: $0.40 per million queries

### 7. S3 ($2.30/月)

**構成:**
- フロントエンド用バケット: 5GB
- アプリケーション用バケット: 45GB
- 月間リクエスト数: 10万リクエスト

**計算:**
- ストレージ料金: 50GB × $0.025 = $1.25
- リクエスト料金: 100,000 × $0.0004 = $0.04
- **合計: $1.29/月**

**価格根拠:**
- [S3 pricing](https://aws.amazon.com/jp/s3/pricing/)
- Standard storage: $0.025 per GB (Tokyo)
- PUT/POST requests: $0.0004 per 1,000 requests

### 8. CloudWatch ($2.00/月)

**構成:**
- ログ収集: 5GB/月
- メトリクス: 20個
- アラーム: 5個

**計算:**
- ログ料金: $0.50/GB × 5GB = $2.50
- メトリクス料金: $0.30 × 20 = $6.00
- アラーム料金: $0.10 × 5 = $0.50
- **合計: $9.00/月**

**価格根拠:**
- [CloudWatch pricing](https://aws.amazon.com/jp/cloudwatch/pricing/)
- Log ingestion: $0.50 per GB
- Custom metrics: $0.30 per metric

### 9. WAF ($0.70/月)

**構成:**
- 1 Web ACL
- 3マネージドルール
- 月間リクエスト数: 500万リクエスト

**計算:**
- Web ACL: $5.00/月
- ルール料金: $1.00 × 3 = $3.00
- リクエスト料金: $0.60/100万リクエスト × 5 = $3.00
- **合計: $11.00/月**

**価格根拠:**
- [WAF pricing](https://aws.amazon.com/jp/waf/pricing/)
- Web ACL: $5.00 per month
- Managed rules: $1.00 per rule
- Requests: $0.60 per million requests

## 見積もり条件と前提

### 利用量の前提
- **想定ユーザー数**: 1,000 DAU
- **トラフィック量**: High
- **可用性**: High (Multi-AZ構成)
- **セキュリティ**: High (WAF + セキュリティグループ)

### 月間利用量の想定
- **Webリクエスト**: 500万リクエスト
- **データ転送**: 100GB
- **データベース**: 10GB
- **ログ**: 5GB
- **ストレージ**: 50GB

### 考慮事項
1. **オンデマンド価格**: すべてオンデマンド価格で算出
2. **Data Transfer**: リージョン間転送は含まず
3. **バックアップ**: 自動バックアップ7日間分を含む
4. **モニタリング**: 基本的なメトリクスとアラームを含む

### 除外項目
- **Reserved Instances**: 長期利用による割引なし
- **Savings Plans**: 適用なし
- **データ転送**: インターネット向け以外の転送料金
- **サポート**: AWSサポートプラン料金
- **開発/運用**: 開発環境や運用コスト

## 価格根拠URL

| サービス | 価格参照URL |
|---------|-------------|
| ECS Fargate | https://aws.amazon.com/jp/fargate/pricing/ |
| Application Load Balancer | https://aws.amazon.com/jp/elasticloadbalancing/pricing/ |
| Aurora Serverless v2 | https://aws.amazon.com/jp/rds/aurora/pricing/ |
| NAT Gateway | https://aws.amazon.com/jp/vpc/pricing/ |
| CloudFront | https://aws.amazon.com/jp/cloudfront/pricing/ |
| Route 53 | https://aws.amazon.com/jp/route53/pricing/ |
| S3 | https://aws.amazon.com/jp/s3/pricing/ |
| CloudWatch | https://aws.amazon.com/jp/cloudwatch/pricing/ |
| WAF | https://aws.amazon.com/jp/waf/pricing/ |

## 最適化提案

### 短期的な最適化
1. **Reserved Instances**: 1年予約で最大72%削減可能
2. **Savings Plans**: コンピューティング使用量に対して最大66%削減
3. **スケジューリング**: 夜間・休日のリソース削減

### 長期的な最適化
1. **Auto Scaling**: 需要に応じたリソース調整
2. **Lambda移行**: 軽量な処理をLambdaに移行
3. **CDN最適化**: より効率的なキャッシュ戦略

---

**生成日**: 2025-07-09  
**地域**: Asia Pacific (Tokyo)  
**通貨**: USD (JPY換算: 1USD = 150JPY)

:::

## おまけ: GitHub Copilotで設定してみたけども...

GitHub CopilotのAgentモードを利用して同様のことを行いましたが、まずsonnet4で行うとMCPサーバーのアクションの時「max token」でエラーになり、以降の操作ができなくなりました。token長が問題なのでsonnetではなく、gemini-pro2.5で実現できるのではないかと思い、試したのですが、今度は下記の画像のようなエラーが出てフリーズすることが多かったです...😇

![](https://storage.googleapis.com/zenn-user-upload/61d45d9af833-20250709.png)



もっと簡単な見積もり方法があれば教えてください！🙇‍♂️
何か質問があれば、お気軽にコメントください！

https://x.com/Ryo54388667/status/1930424791884046414
