#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, basename } from "node:path";
import { parse as parseYaml } from "yaml";

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

const content = readFileSync(filePath, "utf8");
const match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) {
  console.error(`[check-frontmatter] ${filePath}: frontmatterが見つかりません(--- で囲まれたYAMLブロックが必要です)`);
  process.exit(2);
}

let fm;
try {
  fm = parseYaml(match[1]);
} catch (e) {
  console.error(`[check-frontmatter] ${filePath}: frontmatterのYAMLパースに失敗しました: ${e.message}`);
  process.exit(2);
}

const errors = [];
// zenn-editor の禁止文字正規表現(半角記号・スペース)をそのまま流用。日本語は許容
const FORBIDDEN_TOPIC_CHARS = /[ -/:-@[-`{-~]/;

const slug = basename(filePath, ".md");
if (!/^[0-9a-z\-_]{12,50}$/.test(slug)) {
  errors.push(`スラッグ(ファイル名) "${slug}" が Zenn の制約(半角英小文字・数字・ハイフン・アンダースコア、12〜50字)を満たしていません`);
}

if (typeof fm.title !== "string" || fm.title.trim() === "") {
  errors.push("title が空です");
} else if (fm.title.length > 70) {
  errors.push(`title が70文字を超えています(${fm.title.length}文字)。Zennで公開できません`);
}

if (typeof fm.emoji !== "string" || fm.emoji.length === 0) {
  errors.push("emoji が文字列ではありません");
} else {
  const segments = [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(fm.emoji)];
  // 絵文字判定: 絵文字表意文字 + 国旗(地域指示記号) + キーキャップを許容
  const looksLikeEmoji = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{20E3}/u.test(fm.emoji);
  if (segments.length !== 1 || !looksLikeEmoji) {
    errors.push(`emoji は1つの絵文字のみを指定してください(現在: "${fm.emoji}")`);
  }
}

if (fm.type !== "tech" && fm.type !== "idea") {
  errors.push(`type は "tech" か "idea" のいずれかである必要があります(現在: ${JSON.stringify(fm.type)})`);
}

if (!Array.isArray(fm.topics) || fm.topics.length < 1 || fm.topics.length > 5) {
  errors.push(`topics は1〜5個の配列である必要があります(現在: ${Array.isArray(fm.topics) ? fm.topics.length : "配列でない"}個)`);
} else {
  for (const topic of fm.topics) {
    if (typeof topic !== "string") {
      errors.push(`topics に文字列以外の値があります: ${JSON.stringify(topic)}`);
      continue;
    }
    if (topic.length > 18) {
      errors.push(`topic "${topic}" が18文字を超えています`);
    }
    if (FORBIDDEN_TOPIC_CHARS.test(topic)) {
      errors.push(`topic "${topic}" に使用できない記号・スペースが含まれています(例: C++ → cpp, C# → csharp)`);
    }
  }
}

if (typeof fm.published !== "boolean") {
  errors.push(`published は true/false のboolean である必要があります(現在: ${JSON.stringify(fm.published)})`);
}

if (fm.published_at !== undefined) {
  if (typeof fm.published_at !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(\s[0-9]{2}:[0-9]{2})?$/.test(fm.published_at)) {
    errors.push("published_at の形式が不正です(YYYY-MM-DD または YYYY-MM-DD hh:mm 形式にしてください)");
  }
}

if (errors.length > 0) {
  console.error(`[check-frontmatter] ${filePath} の frontmatter に Zenn公開を壊す不正があります:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(2);
}
process.exit(0);
