---
title: "Next.jsブログをAWS App RunnerからCloudflare Workersへ移行した話（インフラ編）"
emoji: "🏗️"
type: "tech"
topics: ["terraform", "cloudflare", "aws", "infrastructure", "dns"]
published: true
---

:::message
この記事はAIとの共著です。
:::

こんにちは！[@Ryo54388667](https://x.com/Ryo54388667)です！☺️

普段は都内でエンジニアとして業務をしてます！主にTypeScriptやNext.jsといった技術を触っています。

前回の[アプリケーション編](https://zenn.dev/ryota_09/articles/nextjs-cloudflare-workers-migration-app)ではアプリ側の修正を解説しました。本記事では**Terraformによるインフラ構成の変更**、**Cloudflareアカウントのセットアップ**、**DNS移行**にフォーカスしていきます！

## 📌 移行前後のインフラ構成

### 移行前（AWS）

```
Route53 → CloudFront → App Runner (Docker コンテナ)
            ↓
         WAF (REGIONAL)
            ↓
      CloudWatch RUM + Cognito + SNS → Slack
```

| リソース | 用途 |
|---------|------|
| App Runner | Next.jsコンテナホスティング (0.25 vCPU, 0.5 GB) |
| ECR | Dockerイメージ管理 |
| CloudFront | CDN + キャッシュ (10種のcache behavior) |
| WAF | CloudFront秘密ヘッダーによるアクセス制限 + AWS Managed Rules |
| Route53 | DNS (ryotablog.jp) |
| CloudWatch RUM | Real User Monitoring (Cognito + IAM Guest Role) |

Terraformファイル数: **prd/に9ファイル、stg/に10ファイル**

### 移行後（Cloudflare）

```
Cloudflare DNS → Workers Custom Domain → Cloudflare Workers
                                            ├── R2 (ISR キャッシュ)
                                            ├── D1 (タグキャッシュ)
                                            └── Durable Objects (リバリデーション)
```

| リソース | 用途 |
|---------|------|
| Cloudflare Zone | DNS管理 + 自動SSL |
| Workers Custom Domain | カスタムドメインをWorkerに紐付け |
| R2 Bucket | ISRインクリメンタルキャッシュ |
| D1 Database | タグキャッシュ (on-demand revalidation) |

## 📌 Terraform構成の設計方針

### `removed`ブロックによる安全な切り離し

AWSリソースを一気に削除するのではなく、Terraform 1.7の`removed`ブロックで**Terraform管理から切り離すだけ**（AWS上にはリソースが残る）という方式を採りました。

```hcl
# AWS リソースを Terraform 管理から外す（削除はしない）
removed {
  from = aws_apprunner_service.apprunner
  lifecycle { destroy = false }
}
```

**なぜこの方式か:**

- ロールバック可能性を維持できる
- `terraform plan`で差分が明確に見える
- 安定稼働確認後に`destroy = true`に変更するだけで実削除できる
- PRレビューで意図が伝わりやすい（`terraform state rm`のような手動操作が不要）

### Cloudflare Providerのバージョン選定

当初`~> 5.0`を指定していましたが、以下の問題が発覚しました。

- `cloudflare_zone`のリソース属性がv4とv5で異なる（`zone` → `name`、`plan`がread-only化）
- `cloudflare_dns_record`はv5の名前で、v4では`cloudflare_record`
- `cloudflare_workers_custom_domain`はv5の名前で、v4では`cloudflare_workers_domain`

**v5はauto-generated SDKベースでbreaking changesが多く、ドキュメントも過渡期**だったため、安定性を優先して`~> 4.0`（v4.52.7）を採用しました。

```hcl
required_providers {
  cloudflare = {
    source  = "cloudflare/cloudflare"
    version = "~> 4.0"
  }
}
```

### 環境分離の設計

stg / prdで完全にディレクトリを分離し、Terraform stateも別管理を維持しました。

```
ryota-blog-infra/
├── stg/
│   ├── main.tf          # removed ブロック群
│   ├── cloudflare.tf    # 新規 Cloudflare リソース
│   ├── config.tf        # AWS + Cloudflare provider
│   ├── variables.tf
│   └── output.tf
├── prd/
│   ├── main.tf          # removed ブロック群
│   ├── cloudflare.tf    # 新規 Cloudflare リソース
│   ├── config.tf
│   ├── variables.tf
│   ├── output.tf
│   ├── route53.tf       # Zone のみ保持 + removed ブロック
│   ├── acm.tf           # removed ブロックのみ
│   ├── waf.tf           # removed ブロックのみ
│   └── bot.tf           # removed ブロックのみ
```

## 📌 Cloudflareアカウントのセットアップ

### Workers Paidプランの有効化

Workers Freeプランではバンドルサイズが**3 MiB**に制限されます。Next.js + OpenNextのバンドルはこれを超えるため、**Paidプラン ($5/月、10 MiBまで)** が必須です。

:::message alert
Cloudflare Dashboardの「Workers & Pages」画面にはプラン変更ボタンが見当たりませんでした😅 実は、**Workerを一度デプロイしようとしてサイズ制限エラーが出ると、プランアップグレードの導線が表示される**仕組みでした。
:::

### API Tokenの作成

最終的に必要だった権限の一覧です。**最初からこの一覧で作成しておけば、途中でのトークン編集が不要**になります。

| スコープ | 権限 | アクセス | 用途 |
|---------|------|---------|------|
| アカウント | Workersスクリプト | 編集 | Workerデプロイ |
| アカウント | Workers R2 Storage | 編集 | R2バケット管理 |
| アカウント | D1 | 編集 | D1データベース管理 |
| アカウント | Cloudflare Pages | 編集 | Pagesプロジェクト管理 |
| アカウント | アカウント設定 | 読み取り | Wrangler / Terraform |
| ゾーン | ゾーン | **編集** | Zone作成（「読み取り」では不足） |
| ゾーン | DNS | 編集 | DNSレコード管理 |
| ゾーン | Workersルート | 編集 | Workersルーティング |

:::message alert
ゾーンの「読み取り」と「編集」は別権限です。Terraformで Zone を作成する場合は**編集**が必要です。最初「読み取り」しか付与しておらず`terraform apply`でエラーになりました。
:::

### R2の有効化

R2はCloudflare Dashboardで**事前に有効化**する必要があります。初回は支払い情報の登録を求められます。

## 📌 Terraformの適用

### Stagingから段階的に適用

移行はstg → prdの順で進めました。

```bash
cd stg
terraform init -upgrade          # Cloudflare provider ダウンロード
terraform plan -var-file=stg.tfvars   # 差分確認（必須）
terraform apply -var-file=stg.tfvars  # 適用
```

### Workers DomainはWorkerデプロイ後に有効化

`cloudflare_workers_domain`リソースは、紐付け先のWorkerが存在しないと作成に失敗します。

```
Error: error attaching worker domain:
This environment does not exist on this Worker. (10092)
```

**対処:** `cloudflare.tf`でWorkers Domainをコメントアウトして先にZone / R2 / D1を作成。Workerデプロイ後にコメントを解除して再applyしました。TerformとWranglerデプロイの**実行順序に依存関係がある**点に注意が必要ですね。

### CLIで作成済みリソースのimport

prd環境ではD1データベースとR2バケットを先にWrangler CLIで作成していたため、Terraformにimportする必要がありました。

```bash
# D1 の import
terraform import -var-file=prd.tfvars \
  cloudflare_d1_database.tags \
  "<account_id>/<database_id>"

# R2 の import
terraform import -var-file=prd.tfvars \
  cloudflare_r2_bucket.cache \
  "<account_id>/ryota-blog-cache-prd"
```

:::message alert
**R2バケットのリージョン不一致に注意！** CIデプロイ時にENAM（北米）リージョンで自動作成されていたバケットに対し、Terraform側で`location = "APAC"`と指定していたため、import後のplanで**再作成（destroy + create）** が提案されました。既存バケットにはデータが入っていたため削除できず、Terraform側の`location`を既存に合わせて解決しました。
:::

### `awscc` Providerの罠

`bot.tf`でAWS Chatbot（`awscc_chatbot_slack_channel_configuration`等）を管理していた場合、`removed`ブロックで切り離すときにも**`awscc` providerを`required_providers`に宣言する必要があります**。宣言を忘れると`terraform init`が失敗します。

```hcl
required_providers {
  aws = {
    source  = "hashicorp/aws"
    version = ">= 4.9.0"
  }
  awscc = {
    source  = "hashicorp/awscc"
    version = ">= 1.0.0"  # removed ブロック処理に必要
  }
  cloudflare = {
    source  = "cloudflare/cloudflare"
    version = "~> 4.0"
  }
}
```

同様に、CloudFront用ACM証明書を`us-east-1`に作成するための`provider "aws" { alias = "virginia" }`も、全`removed`ブロックの処理が完了するまで削除できません。

## 📌 DNS移行（お名前.com → Cloudflare）

### .jpドメインの制約

`ryotablog.jp`は`.jp`ドメインのため、**Cloudflare Registrarへの移管はできません**。お名前.comでドメイン登録を維持したまま、ネームサーバーのみCloudflareに向けます。

### NS変更手順

1. `terraform output CLOUDFLARE_ZONE_NS`でNSを取得
2. お名前.com → ドメインNavi → ネームサーバーの設定 → 「その他」タブ
3. NSを入力して設定

### DNS伝播の確認

```bash
dig NS ryotablog.jp +short

# 期待する結果:
# <ns1>.ns.cloudflare.com.
# <ns2>.ns.cloudflare.com.
```

伝播には通常数分〜数時間、最大48時間かかります。伝播完了までAWSインフラはそのまま稼働し続けるため、**ダウンタイムはゼロ**です🎉

## 📌 AWSリソースのクリーンアップ

`removed { destroy = false }`で切り離しただけでは、AWS上のリソースは**そのまま稼働し課金が続きます**。安定稼働を確認した後、以下の対応を行いました。

### App Runner → 停止（PAUSED）

Pause機能でコンピューティング課金を止めつつサービス定義を保持できます。

```bash
aws apprunner pause-service \
  --service-arn "arn:aws:apprunner:ap-northeast-1:..." \
  --region ap-northeast-1
```

### WAF → 削除

WAFには停止機能がなく、WebACLが存在するだけで月額$5〜が発生します。Associationを先に解除してからACLを削除しました。

### Route53 Zone → 削除

`removed`ブロックの`destroy = false`を`true`に変更して`terraform apply`。

:::message alert
Route53 ZoneはNS / SOA以外のレコードが残っていると削除できません。AWS CLIで一括削除してからapplyしました。
:::

## 📌 StorybookをCloudflare Pagesに移行

ブログ本体に加えて、StorybookのホスティングもCloudflare Pagesに移行しました。Storybookは静的サイトなので、WorkersではなくPages（静的ホスティング特化）が最適です。

```hcl:cloudflare.tf
resource "cloudflare_pages_project" "storybook" {
  account_id        = var.cloudflare_account_id
  name              = "${var.repo_name}-storybook"
  production_branch = "main"

  source {
    type = "github"
    config {
      owner                         = var.repo_org
      repo_name                     = var.repo_name
      production_branch             = "main"
      production_deployment_enabled = true
      pr_comments_enabled           = true
      preview_deployment_setting    = "custom"
      preview_branch_includes       = ["develop"]
    }
  }

  build_config {
    build_command   = "npm run build-storybook"
    destination_dir = "storybook-static"
  }
}
```

:::message
**ハマりポイント:**
- API Tokenに**Pages権限**が必要（Workers用トークンでは不足）
- Terraformで`source.type = "github"`を指定する前に、**Cloudflare Dashboard からGitHub連携を手動で設定**する必要がある
- DNSレコードは`proxied = true`にしないとSSL証明書の発行に失敗する
:::

## 📌 コスト比較

| 項目 | AWS（移行前） | Cloudflare（移行後） |
|------|-------------|---------------------|
| App Runner (prd+stg) | ~$10-30/月 | - |
| CloudFront | ~$1-5/月 | - |
| WAF | ~$7/月 | - |
| RUM + Cognito | ~$1-5/月 | - |
| ECR | ~$1/月 | - |
| Route53 Zone | ~$1/月 | - |
| Workers Paid | - | $5/月 |
| R2 / D1 / DNS / SSL | - | $0（無料枠内） |
| **合計** | **~$20-50/月** | **~$5/月** |

## 📌 ロールバック計画

段階的なロールバック計画を用意しています。

### Level 1: Workersデプロイロールバック（数秒）

```bash
wrangler rollback --name ryota-blog-prd
```

### Level 2: DNSロールバック（数分〜数時間）

お名前.comでNSをRoute53のNSに戻すだけです。Route53 ZoneとAWSリソースは`removed { destroy = false }`で保持しているため、即座にトラフィックをAWSに戻せます。

### Level 3: Terraform完全復旧

`removed`ブロックを削除して元のリソース定義に戻し、`terraform import`でstateに再登録します。

## 📌 まとめ

今回のインフラ移行により：

- **リソース数の大幅削減**: AWS 29リソース → Cloudflare 5リソース
- **運用の簡素化**: コンテナビルド、ECRライフサイクル管理、WAFルール管理、ACM証明書更新が不要に
- **コスト削減**: 月額$20-50 → $5
- **ゼロダウンタイム移行**: `removed`ブロック + DNS切り替えで無停止移行を実現
- **段階的ロールバック**: Workers / DNS / Terraformの3段階で復旧可能

移行で学んだことをまとめると以下の通りです。

1. **`removed`ブロックは最強の安全装置** ── `terraform state rm`なしで宣言的にリソースを切り離せる。ロールバックも容易
2. **Cloudflare Providerはv4を選べ（2026年4月時点）** ── v5はauto-generated SDKベースでリソース名・属性名が大幅に変わっている
3. **API Tokenの権限は事前に全て洗い出す** ── 足りないと`terraform apply`の途中で失敗し、stateが中途半端になる
4. **Workers DomainはWorkerデプロイ後にしか作成できない** ── TerraformとWranglerデプロイの実行順序に依存関係がある
5. **CLIで作成したリソースは`terraform import`を忘れずに** ── R2バケットのリージョン不一致で再作成が提案され、データが消えるところだった
6. **CloudFrontは`enabled = false`にしてから削除** ── 有効なまま destroyするとTerraformがエラーで止まる

同じようにAWSからCloudflareへのインフラ移行を検討している方の参考になれば幸いです！

最後まで読んでいただきありがとうございます！

気ままにつぶやいているので、気軽にフォローをお願いします！🥺
