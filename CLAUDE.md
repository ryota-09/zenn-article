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
- No specific linting or testing tools are configured
- The repository follows standard Zenn content structure conventions