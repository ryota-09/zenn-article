#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

function getFilePath() {
  if (process.argv[2]) return process.argv[2];
  try {
    const input = readFileSync(0, "utf8");
    if (!input.trim()) return null;
    const data = JSON.parse(input);
    return data?.tool_input?.file_path ?? null;
  } catch {
    return null;
  }
}

const filePath = getFilePath();
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = relative(projectDir, resolve(filePath));
if (!/^articles\/.*\.md$/.test(rel)) process.exit(0);
if (!existsSync(filePath)) process.exit(0);

const RULES = [
  [/AKIA[0-9A-Z]{16}/, "AWSアクセスキー"],
  [/ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}/, "GitHubトークン"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slackトークン"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
  [
    /(api[_-]?key|apikey|secret|token|password|passwd)["']?\s*[:=]\s*["'][^"'{}<>]{8,}["']/i,
    "資格情報らしき代入(プレースホルダー {NAME} / <name> 形式なら許容)",
  ],
  [/[0-9a-f]{32,}/i, "長いhex文字列。固有IDの可能性、プレースホルダー化を検討"],
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, "メールアドレス。意図的な掲載か確認"],
];

const lines = readFileSync(filePath, "utf8").split("\n");
const findings = [];
lines.forEach((line, i) => {
  for (const [pattern, label] of RULES) {
    if (pattern.test(line)) {
      findings.push(`  L${i + 1}: ${label}\n    ${line.trim().slice(0, 120)}`);
    }
  }
});

if (findings.length > 0) {
  console.error(
    `[scan-secrets] ${filePath} に秘匿情報の疑いがあります:\n${findings.join("\n")}\nプレースホルダー化を検討してください(docs/zenn-rules.md の「秘匿すべき情報の扱い」参照)。`
  );
  process.exit(2);
}
process.exit(0);
