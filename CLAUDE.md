# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Zenn content repository for managing technical articles and books written in Japanese. Zenn is a Japanese technical writing platform where developers share knowledge through articles and books.

## Common Commands

### Preview Content
```bash
npx zenn preview
```
This starts a local preview server (usually at http://localhost:8000) where you can see your articles and books as they would appear on Zenn.

### Create New Content
```bash
# Create a new article
npx zenn new:article

# Create a new book
npx zenn new:book
```

### List Content
```bash
# List all articles
npx zenn list:articles

# List all books
npx zenn list:books
```

## Project Structure

- `articles/` - Contains individual article markdown files
  - Each article is a single `.md` file with frontmatter metadata
- `books/` - Contains book directories
  - Each book has its own directory with multiple chapter files
- `package.json` - Node.js project configuration with Zenn CLI as a dependency

## Content Guidelines

### Article Structure
Articles are standalone markdown files in the `articles/` directory. They should include frontmatter with metadata like:
- title
- emoji
- type (tech/idea)
- topics (tags)
- published (true/false)

### Book Structure
Books are organized in subdirectories under `books/`. Each book directory contains:
- `config.yaml` - Book configuration
- Chapter files (e.g., `1.md`, `2.md`)

## Development Workflow

1. Use `npx zenn preview` to start the preview server before writing
2. Create new content using the appropriate `zenn new:*` command
3. Write content in markdown format
4. Preview changes in the browser
5. Commit changes when satisfied

## Important Notes

- This repository uses Zenn CLI v0.2.1
- Content is written in Japanese markdown
- Linting is configured via textlint (`npm run lint` / `npm run lint:fix`); see `.textlintrc.json` and `prh.yml`
- The repository follows standard Zenn content structure conventions

## AI執筆ワークフロー

- 新規記事の執筆: `/write-article`(調査→構成→執筆→セルフチェック)
- 公開前の総合レビュー: `/review-article`(textlint+文体+剽窃+ファクトチェックを一括)
- 個別チェック: `/style-check`(文体) / `/plagiarism-check`(剽窃)
- 文体・Zenn記法・雛形の正データは `docs/write-style.md` / `docs/zenn-rules.md` / `docs/template.md`(本ファイルに複製しない)
- `articles/*.md` 編集後に秘匿情報スキャンとfrontmatter検証が自動実行される(`.claude/scripts/`)
- まとめ等で✅絵文字は使わない。AI共著記事は冒頭に `:::message この記事はAIとの共著です。 :::`
- `published: true` への変更はユーザーの明示指示があるときのみ