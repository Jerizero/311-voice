# 311-voice

Natural-language CLI for drafting, geocoding, preparing, and tracking NYC 311 complaints backed by SQLite.

## Setup

```bash
nvm use          # Node 22 (.nvmrc) required for better-sqlite3 native binary
npm install
npm run build
```

## Usage

```bash
npm start
# or without launching the browser portal step:
node dist/index.js --no-browser
```

## Checks

```bash
npm test
npm run build
```
