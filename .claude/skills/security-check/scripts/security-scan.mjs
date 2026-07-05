#!/usr/bin/env node
// 記事公開前の秘匿情報スキャナ(security-checkスキルのドライバ)。
// hookの scan-secrets.mjs(編集時の即時ブロック用・軽量)とは役割が異なり、
// こちらは公開前に1回かける総合スキャン: 広いルールセット+git履歴+画像列挙。
//
// 使い方:
//   node .claude/skills/security-check/scripts/security-scan.mjs <記事.md ...> [--json] [--no-history]
//   node .claude/skills/security-check/scripts/security-scan.mjs --all [--json]
//
// 終了コード: 0=high/mediumなし, 1=high/mediumあり(履歴含む), 64=引数エラー

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const noHistory = args.includes("--no-history");
const scanAll = args.includes("--all");
let files = args.filter((a) => !a.startsWith("--"));

function git(cwd, ...a) {
  try {
    return execFileSync("git", a, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    }).replace(/\n$/, "");
  } catch {
    return null;
  }
}

const repoRoot = git(process.cwd(), "rev-parse", "--show-toplevel");

if (scanAll) {
  if (!repoRoot) {
    console.error("--all はgitリポジトリ内でのみ使えます");
    process.exit(64);
  }
  files = (git(repoRoot, "ls-files", "--cached", "--others", "--exclude-standard", "articles/*.md") || "")
    .split("\n")
    .filter(Boolean)
    .map((f) => resolve(repoRoot, f));
}
if (files.length === 0 && !args.includes("--self-test")) {
  console.error("使い方: security-scan.mjs <記事.md ...> [--json] [--no-history] | --all | --self-test");
  process.exit(64);
}

// ---- プレースホルダー抑制 -------------------------------------------------
// docs/zenn-rules.md の規約({名前} / < 説明 > 形式)や明らかなダミー値は検出しない
const PLACEHOLDER_HINTS = [
  /\{[^{}]*\}/, // {database_id} / ${VAR} / ${{ secrets.X }}
  /<[^<>]*>/, // <your-d1-database-id> / <アカウントID>
  /x{4,}/i,
  /\*{3,}/,
  /(?:your|my)[_-]/i,
  /example/i,
  /dummy/i,
  /sample/i,
  /placeholder/i,
  /\.{3}/,
  /…/,
];
const isPlaceholder = (s) => PLACEHOLDER_HINTS.some((re) => re.test(s));

function isNonRoutableOrDocIp(m) {
  const o = m.split(".").map(Number);
  if (o.some((n) => n > 255)) return true; // IPではない(バージョン番号等)
  if (o[3] === 0) return true; // ネットワークアドレス or UA等のバージョン表記(Chrome/147.0.0.0)
  const [a, b] = o;
  if (a === 10 || a === 127 || a === 0 || a === 255) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true; // 203.0.113.0/24(ドキュメント用)
  if (a >= 224) return true; // マルチキャスト・予約
  return ["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9"].includes(m);
}

// ---- 検出ルール -----------------------------------------------------------
// sev: high=ほぼ確実に秘匿情報 / medium=固有ID等の可能性が高い / info=文脈確認が必要
const RULES = [
  { id: "aws-access-key", sev: "high", label: "AWSアクセスキーID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "github-token", sev: "high", label: "GitHubトークン", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { id: "slack-token", sev: "high", label: "Slackトークン", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: "slack-webhook", sev: "high", label: "Slack Webhook URL", re: /hooks\.slack\.com\/services\/T[A-Za-z0-9_/]+/g },
  { id: "ai-api-key", sev: "high", label: "OpenAI/Anthropic系APIキー", re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: "google-api-key", sev: "high", label: "Google APIキー", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "google-oauth", sev: "high", label: "Google OAuthトークン", re: /\bya29\.[0-9A-Za-z_-]{20,}\b/g },
  { id: "stripe-live-key", sev: "high", label: "Stripe本番キー", re: /\b[rs]k_live_[0-9a-zA-Z]{16,}\b/g },
  { id: "sendgrid-key", sev: "high", label: "SendGrid APIキー", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { id: "npm-token", sev: "high", label: "npmトークン", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: "private-key", sev: "high", label: "秘密鍵", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "jwt", sev: "high", label: "JWT", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g },
  { id: "url-basic-auth", sev: "high", label: "認証情報付きURL(user:pass@)", re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@"'<>]+:[^/\s:@"'<>]+@[\w.-]+/gi },
  { id: "aws-arn", sev: "medium", label: "実アカウントIDを含むAWS ARN", re: /\barn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:\d{12}\b/g },
  { id: "uuid", sev: "medium", label: "UUID(D1 database_id等の固有IDの可能性)", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { id: "long-hex", sev: "medium", label: "32桁以上のhex(アカウントID等の可能性)", re: /\b[0-9a-f]{32,}\b/gi },
  {
    id: "credential-assign",
    sev: "medium",
    label: "資格情報らしき代入",
    re: /(?<![?&])(?:api[_-]?key|apikey|secret|token|passwd|password|credential|auth[_-]?key)["']?\s*[:=]\s*["']?[^"'{}<>\s]{8,}/gi,
    // 環境変数の参照(process.env.X等)は実値ではないため除外
    suppress: (m) => /process\.env|import\.meta\.env|os\.environ|getenv|ENV\[/i.test(m),
  },
  { id: "url-token-param", sev: "medium", label: "URLクエリ内のトークンらしき値", re: /[?&](?:token|key|api_?key|secret|signature|sig|password|auth|access_?token)=[^&\s"'<>{}]{8,}/gi },
  {
    id: "email",
    sev: "info",
    label: "メールアドレス(意図的な掲載か確認)",
    re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,}\b/g,
    // noreply系・example系、およびURLのuserinfo部(url-basic-auth側で報告済み)は除外
    suppress: (m, line, index) => /noreply|no-reply|@example\.(com|org|net)$/i.test(m) || (line.charAt(index - 1) === ":" && /:\/\/\S*@/.test(line)),
  },
  { id: "public-ip", sev: "info", label: "パブリックIPアドレスの可能性", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, suppress: isNonRoutableOrDocIp },
];

function scanContent(content, { severities } = {}) {
  const findings = [];
  content.split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      if (severities && !severities.includes(rule.sev)) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const text = m[0];
        if (isPlaceholder(text)) continue;
        if (rule.suppress && rule.suppress(text, line, m.index)) continue;
        findings.push({ rule: rule.id, sev: rule.sev, label: rule.label, line: i + 1, match: text, context: line.trim().slice(0, 120) });
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  });
  return findings;
}

// ---- 画像列挙(スクリーンショット内の秘匿情報はregexで検出できないため目視対象) ----
function extractImages(content) {
  const images = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+=\d+x\d*)?\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const url = m[1];
    const local = url.startsWith("/images/");
    images.push({
      url,
      local,
      exists: local && repoRoot ? existsSync(resolve(repoRoot, url.slice(1))) : null,
    });
  }
  return images;
}

// ---- git履歴スキャン --------------------------------------------------------
// 「後からマスクしたが、マスク前の実値が公開履歴に残っている」ケースを検出する。
// 現行版に存在しないhigh/mediumマッチのみ報告する。
function scanHistory(absFile, currentContent) {
  if (!repoRoot) return { skipped: "gitリポジトリ外" };
  const rel = relative(repoRoot, absFile).split("\\").join("/");
  if (git(repoRoot, "ls-files", "--error-unmatch", rel) === null) {
    return { skipped: "未コミットのファイル(履歴なし)" };
  }
  const commits = (git(repoRoot, "log", "--format=%h", "--", rel) || "").split("\n").filter(Boolean);
  const findings = [];
  const seen = new Set();
  for (const commit of commits) {
    const blob = git(repoRoot, "show", `${commit}:${rel}`);
    if (blob === null) continue; // リネーム等でこのコミットに存在しない
    for (const f of scanContent(blob, { severities: ["high", "medium"] })) {
      if (seen.has(f.match)) continue;
      if (currentContent.includes(f.match)) continue; // 現行版にもある→コンテンツスキャン側で報告済み
      seen.add(f.match);
      findings.push({ ...f, commit });
    }
  }
  return { findings, commitCount: commits.length };
}

// ---- セルフテスト -------------------------------------------------------------
// ルール変更後の回帰確認用: node security-scan.mjs --self-test
// 疑似シークレットは文字列連結で組み立てる(このファイル自体がGitHubのsecret scanningや
// 本スキャナ自身に誤検知されないようにするため)
function selfTest() {
  const tp = [
    ["aws-access-key", "AKIA" + "Q7ZXCVBNMASDFGHJ"],
    ["github-token", "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"],
    ["uuid", "3f2a9b1c-4d5e-4f70-" + "8a9b-0c1d2e3f4a5b"],
    ["long-hex", "7c1e2f3a4b5d6e7f" + "8091a2b3c4d5e6f7"],
    ["url-basic-auth", "postgres://appuser:S3cret" + "Pass@db.internal.test"],
    ["credential-assign", 'api_key = "zXy98wVu76' + 'tSr54qPo32"'],
    ["url-token-param", "https://internal.test/dl?token=" + "abcdef1234567890"],
    ["email", "taro.yamada@" + "gmail.com"],
    ["public-ip", "54.210.11.22"],
    ["aws-arn", "arn:aws:iam::" + "123456789012:role/AppRole"],
    ["jwt", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + ".eyJzdWIiOiIxMjM0NTY3ODkwIn0"],
  ];
  const fp = [
    '"database_id": "{database_id}"',
    '"database_id": "<your-d1-database-id>"',
    'database_id: "********-****-****-****-************"',
    "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
    "arn:aws:iam::<アカウントID>:role/xxxxx",
    "arn:< userのid >/xxxxx",
    "AKIA" + "IOSFODNN7EXAMPLE", // AWS公式ドキュメントの例示キー(exampleで抑制)
    "192.168.1.1 と 10.0.0.1 と 203.0.113.5 と 1.1.1.1",
    "noreply@anthropic.com と info@example.com",
    "next@16.2.3 requires next@^13.5.0",
    '"Chrome/147.0.0.0 Safari/537.36"',
    "apiKey: process.env.OPENAI_API_KEY,",
    "wrangler secret put MICROCMS_API_KEY",
  ];
  const tpFound = scanContent(tp.map(([, v]) => v).join("\n"));
  const fpFound = scanContent(fp.join("\n"));
  const missed = tp.filter(([id]) => !tpFound.some((f) => f.rule === id)).map(([id]) => id);
  let ok = true;
  if (missed.length > 0) {
    ok = false;
    console.error(`NG: 検出されるべきルールが発火しませんでした: ${missed.join(", ")}`);
  }
  if (fpFound.length > 0) {
    ok = false;
    console.error(`NG: 誤検知が${fpFound.length}件あります:`);
    for (const f of fpFound) console.error(`  [${f.rule}] ${f.match}`);
  }
  if (ok) console.log(`self-test PASS(真陽性${tp.length}ルール発火・誤検知0件)`);
  process.exit(ok ? 0 : 1);
}
if (args.includes("--self-test")) selfTest();

// ---- 実行 -------------------------------------------------------------------
const results = [];
for (const file of files) {
  const abs = resolve(file);
  if (!existsSync(abs)) {
    results.push({ file, error: "ファイルが存在しません" });
    continue;
  }
  const content = readFileSync(abs, "utf8");
  const relPath = repoRoot ? relative(repoRoot, abs) : file;
  results.push({
    file: relPath.startsWith("..") ? file : relPath,
    findings: scanContent(content),
    images: extractImages(content),
    history: noHistory ? { skipped: "--no-history指定" } : scanHistory(abs, content),
  });
}

const count = (sev) =>
  results.reduce(
    (n, r) =>
      n +
      (r.findings?.filter((f) => f.sev === sev).length ?? 0) +
      (sev !== "info" ? (r.history?.findings?.filter((f) => f.sev === sev).length ?? 0) : 0),
    0
  );
const summary = { high: count("high"), medium: count("medium"), info: count("info") };

if (asJson) {
  console.log(JSON.stringify({ summary, results }, null, 2));
} else {
  for (const r of results) {
    console.log(`=== ${r.file} ===`);
    if (r.error) {
      console.log(`  エラー: ${r.error}`);
      continue;
    }
    if (r.findings.length === 0) console.log("  コンテンツ: 検出なし");
    for (const f of r.findings) {
      console.log(`  [${f.sev.toUpperCase()}] L${f.line} ${f.label}: ${f.match}`);
      console.log(`      ${f.context}`);
    }
    if (r.history.skipped) {
      console.log(`  履歴: スキップ(${r.history.skipped})`);
    } else if (r.history.findings.length === 0) {
      console.log(`  履歴: 検出なし(${r.history.commitCount}コミットを走査)`);
    } else {
      for (const f of r.history.findings) {
        console.log(`  [HISTORY][${f.sev.toUpperCase()}] commit ${f.commit} ${f.label}: ${f.match}`);
        console.log(`      現行版には無いが公開履歴から参照可能。値のローテーション(無効化)を検討`);
      }
    }
    if (r.images.length > 0) {
      console.log(`  画像(スクリーンショット内の秘匿情報は目視確認が必要):`);
      for (const img of r.images) {
        console.log(`    - ${img.url}${img.local ? (img.exists ? "" : " (ファイルが見つかりません)") : " (外部URL)"}`);
      }
    }
  }
  console.log(`\nサマリ: high=${summary.high} medium=${summary.medium} info=${summary.info}`);
}

process.exitCode = summary.high + summary.medium > 0 ? 1 : 0;
