<div align="center">

# KONTROL

### Ship containers you can actually trust.

**An open-source Container Security & Configuration Audit toolkit - dashboard, CLI, HTTP API and GitHub Action - that scores your Dockerfiles, explains every risk, and hands you the exact fix.**

[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee.svg?style=flat-square)](#license)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg?style=flat-square)](#)
[![GitHub package.json version](https://img.shields.io/github/package-json/v/mayurbagade456/kontrol?filename=backend%2Fpackage.json&style=flat-square&label=version&color=0891b2)](https://github.com/mayurbagade456/kontrol)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Output: JSON | MD | SARIF](https://img.shields.io/badge/output-JSON%20%7C%20MD%20%7C%20SARIF-6C4CF1.svg?style=flat-square)](#output-formats)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-blueviolet.svg?style=flat-square)](#contributing)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Why KONTROL](#why-kontrol)
- [Architecture](#architecture)
- [Security Rule Set](#security-rule-set)
- [Scoring Model](#scoring-model)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Use It in Your Pipeline](#use-it-in-your-pipeline)
  - [CLI](#cli)
  - [GitHub Action](#github-action)
  - [Any CI via the HTTP API](#any-ci-via-the-http-api)
  - [Output formats](#output-formats)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Offline Fallback Engine](#offline-fallback-engine)
- [Extending the Rule Set](#extending-the-rule-set)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

KONTROL is a lightweight, rule-driven static analyzer for container definitions. Use it three ways, all powered by the same engine and rule set:

| Surface | Best for | Output |
| --- | --- | --- |
| **Dashboard** (React) | Interactive review while editing a Dockerfile | Score card, findings with fixes, README badge |
| **CLI** (`npx kontrol-audit`) | CI gates, pre-commit hooks, local terminals | `text`, `json`, `md`, `sarif` + exit codes |
| **HTTP API** (Express) | Any pipeline or tool that can `curl` | JSON, Markdown or SARIF, negotiated per request |

Every audit returns:

- A **security score** (0 - 100) and a **letter grade** (A - F)
- A **severity breakdown** (High / Medium / Low)
- A ranked list of **findings**, each with a plain-English explanation and a copy-ready **remediation snippet**
- A **Shields.io badge** you can embed in your repository README to publish your score

No data is persisted. Audits are stateless, and when the API is unavailable the dashboard transparently falls back to an identical in-browser engine so the tool keeps working.

---

## Why KONTROL

Developers own Dockerfiles. Security teams own policy. The gap between the two is where misconfigurations live: containers running as root, floating `:latest` tags, credentials baked into layers, data-store ports exposed on application images.

KONTROL bridges Dev and Sec by making policy **executable, explainable, and immediate**:

| Problem | How KONTROL addresses it |
| --- | --- |
| Security feedback arrives late, in a CI gate or a pentest report | Instant feedback while the Dockerfile is still open in the editor |
| Findings are cryptic and lack context | Every rule includes a description of the risk and a ready-to-paste fix |
| Policies are locked inside proprietary scanners | Rules are a plain `rules.json` file anyone can read, review, and extend |
| Tooling breaks when infrastructure is down | A client-side engine with the same rule set guarantees availability |
| Security posture is invisible | A generated badge turns the score into a visible, shareable signal |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                               Browser                                    │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  React 18 + Vite + Tailwind                                        │  │
│  │                                                                    │  │
│  │  Header ─ AuditInput ─ ScoreCard ─ FindingsList ─ BadgeGenerator   │  │
│  │                         │                                          │  │
│  │                         ▼                                          │  │
│  │              App.jsx  (orchestration + fallback)                   │  │
│  │               │                     │                              │  │
│  │     fetch /api/scan        lib/auditEngine.js (client engine)      │  │
│  └───────┼─────────────────────────────┼──────────────────────────────┘  │
└──────────┼─────────────────────────────┼─────────────────────────────────┘
           │ HTTPS / JSON                │ used only when API is unreachable
           ▼                             │
┌──────────────────────────────┐         │
│  Express API (backend)       │         │     ┌────────────────────────────┐
│                              │         │     │  CLI  (backend/cli.js)       │
│  GET  /api/health            │         │     │  kontrol Dockerfile --format │
│  GET  /api/rules             │         │     │  --fail-on / --min-score     │
│  POST /api/scan              │         │     │  (wrapped by action.yml)     │
│    json | md | text | sarif  │         │     └──────────────┬───────────────┘
└──────────────┬───────────────┘         │                    │
               │                         │                    │
               ▼                         │                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  backend/lib/engine.js  ── rules.json                             │
│  loadRules · scanContent · evaluatePolicy · render{Md,Text,Sarif} │
└───────────────────────────────────────────────────────────────────┘
```

**Request lifecycle for `POST /api/scan`:**

1. The body is accepted as JSON (`{ content }`) or as a raw `text/*` Dockerfile, then validated (non-empty, under the size limit).
2. The response format is resolved from `?format=` or the `Accept` header.
3. Each rule's `matchPattern` is compiled once at startup with the `gim` flags (global, case-insensitive, multiline).
4. Positive rules trigger when the pattern **matches**; `negativeCheck` rules trigger when the pattern is **absent**.
5. Line numbers and snippets are recorded as evidence for positive matches.
6. Score, grade, severity totals and badge URLs are computed and rendered as JSON, Markdown, text or SARIF.

---

## Security Rule Set

| ID | Title | Severity | Type |
| --- | --- | --- | --- |
| `SEC-001` | Container runs as root user | High | Pattern present |
| `SEC-002` | Mutable base image tag (`:latest`) | High | Pattern present |
| `SEC-003` | Sensitive database or cache port exposed (3306, 27017, 6379, 5432) | Medium | Pattern present |
| `SEC-004` | Missing `WORKDIR` instruction | Low | Pattern absent |
| `SEC-005` | Missing `HEALTHCHECK` instruction | Medium | Pattern absent |
| `SEC-006` | Hard-coded secret in `ENV` or `ARG` | High | Pattern present |
| `SEC-007` | `ADD` used instead of `COPY` | Low | Pattern present |

All rules live in [`backend/rules.json`](backend/rules.json) and are mirrored in [`frontend/src/lib/auditEngine.js`](frontend/src/lib/auditEngine.js) for offline use.

---

## Scoring Model

Every audit starts at **100** and deducts points per triggered rule:

| Severity | Deduction |
| --- | --- |
| High | -25 |
| Medium | -15 |
| Low | -5 |

The score is floored at **0** and mapped to a grade:

| Grade | Score range |
| --- | --- |
| **A** | 90 - 100 |
| **B** | 75 - 89 |
| **C** | 60 - 74 |
| **D** | 40 - 59 |
| **F** | 0 - 39 |

---

## Project Structure

```
kontrol/
├── action.yml               # Composite GitHub Action wrapping the CLI
├── .github/workflows/
│   └── example-kontrol.yml  # Reference workflow: audit + SARIF upload
├── examples/
│   ├── insecure.Dockerfile  # Triggers 6 of 7 rules (score 10 / F)
│   └── hardened.Dockerfile  # Passes every rule (score 100 / A)
├── backend/
│   ├── server.js            # Express API: content negotiation, validation, errors
│   ├── cli.js               # Zero-dependency CLI for pipelines (bin: kontrol)
│   ├── lib/
│   │   └── engine.js        # Shared rule loader, scanner, policy + report renderers
│   ├── rules.json           # Declarative security rule set
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js       # Dev server + /api proxy to the backend
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx         # React entry point
│       ├── App.jsx          # Stage layout, API calls, offline fallback
│       ├── index.css        # Tailwind layers + design-system classes
│       ├── lib/
│       │   └── auditEngine.js   # Client-side rule engine + sample Dockerfile
│       └── components/
│           ├── Header.jsx          # Branding, rule ticker, API status, GitHub link
│           ├── AuditInput.jsx      # Dockerfile editor, Load Sample, Run Audit
│           ├── ScoreCard.jsx       # 3D tilt score card, grade sticker, severity tiles
│           ├── FindingsList.jsx    # Empty / success / findings states
│           └── BadgeGenerator.jsx  # Shields.io markdown + copy-to-clipboard
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** and **npm 9+**
- Git

### Quick start (CLI only, no install)

```bash
npx kontrol-audit path/to/Dockerfile
```

Or from a clone, using the bundled examples:

```bash
git clone https://github.com/mayurbagade456/kontrol.git
cd kontrol
node backend/cli.js examples/insecure.Dockerfile      # score 10 / F, 6 findings
node backend/cli.js examples/hardened.Dockerfile      # score 100 / A
```

The CLI has no third-party dependencies, so `npm install` is only required for the API server and the dashboard below. See [Use It in Your Pipeline](#use-it-in-your-pipeline) for formats and policy flags.

### 1. Clone the repository

```bash
git clone https://github.com/mayurbagade456/kontrol.git
cd kontrol
```

### 2. Start the backend API

```bash
cd backend
npm install
cp .env.example .env        # optional: adjust PORT / CORS_ORIGIN
npm start                   # production mode  -> http://localhost:4000
# or
npm run dev                 # auto-reload with nodemon
```

Verify it is up:

```bash
curl http://localhost:4000/api/health
# {"status":"healthy","version":"1.0.0","timestamp":"...","rulesLoadedCount":7,"formats":["json","md","text","sarif"]}
```

### 3. Start the frontend dashboard

Open a second terminal:

```bash
cd frontend
npm install
npm run dev                 # -> http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:4000`, so no CORS configuration is needed in development.

### 4. Build for production

```bash
cd frontend
npm run build               # outputs static assets to frontend/dist
npm run preview             # serve the production build locally
```

Deploy `frontend/dist` to any static host and point `VITE_API_URL` at your API origin at build time.

### 5. Run your first audit

1. Click **Load Sample** to insert an intentionally insecure Dockerfile.
2. Click **Run Security Audit** (or press `Ctrl/Cmd + Enter`).
3. Review the score, findings, and remediation blocks.
4. Click **Copy Badge Markdown** and paste it into your README.

Prefer the terminal? The same audit is one command away: `node backend/cli.js Dockerfile --format md`.

---

## Use It in Your Pipeline

The dashboard is only one front door. The same engine ships as a dependency-free CLI, a composite GitHub Action, and an HTTP API that speaks JSON, Markdown and SARIF.

### CLI

Published on npm as [`kontrol-audit`](https://www.npmjs.com/package/kontrol-audit) (bin name `kontrol`). It has no third-party dependencies - Node 18+ is all you need.

```bash
# Run without installing
npx kontrol-audit Dockerfile

# Or install once
npm i -g kontrol-audit
kontrol Dockerfile

# Or straight from a clone of this repo
node backend/cli.js Dockerfile
```

```
Usage
  kontrol [options] <file...>
  cat Dockerfile | kontrol [options] -

Options
  -f, --format <fmt>      text (default), json, md, sarif
  -o, --output <file>     Write the report to a file instead of stdout
      --fail-on <sev>     Exit 1 if any finding is at/above: high, medium, low
      --min-score <n>     Exit 1 if the score is below <n>
      --rules <path>      Use a custom rules.json
      --api <url>         Scan through a remote KONTROL API instead of locally
      --no-color          Disable ANSI colors
  -q, --quiet             Only exit codes and errors
```

| Exit code | Meaning |
| --- | --- |
| `0` | Audit passed the configured policy |
| `1` | Policy failed (`--fail-on` / `--min-score`) |
| `2` | Invalid usage |
| `3` | Runtime error (unreadable file, API unreachable) |

Typical gates:

```bash
# Block merges on any High finding, require at least 70/100
kontrol Dockerfile --fail-on high --min-score 70

# Audit every service, write one Markdown report
kontrol services/*/Dockerfile --format md --output reports/kontrol.md

# Machine-readable output for your own tooling
kontrol Dockerfile --format json | jq '.score, .grade'

# Code-scanning compatible SARIF
kontrol Dockerfile --format sarif --output kontrol.sarif
```

Try it against the bundled examples: [examples/insecure.Dockerfile](examples/insecure.Dockerfile) scores 10/F, [examples/hardened.Dockerfile](examples/hardened.Dockerfile) scores 100/A.

### GitHub Action

[action.yml](action.yml) is a composite action that runs the CLI, appends a Markdown report to the **job summary**, writes the report file you asked for, exposes `score` / `grade` / `findings` / `badge-markdown` as outputs, and fails the step according to your policy.

```yaml
- uses: mayurbagade456/kontrol@main
  id: kontrol
  with:
    path: Dockerfile            # space-separated list or shell glob
    format: sarif               # md | json | sarif | text
    output: kontrol.sarif
    fail-on: high
    min-score: 70

- uses: github/codeql-action/upload-sarif@v4
  if: always() && hashFiles('kontrol.sarif') != ''
  with:
    sarif_file: kontrol.sarif

- run: echo "Score ${{ steps.kontrol.outputs.score }} (${{ steps.kontrol.outputs.grade }})"
```

A complete reference workflow lives at [.github/workflows/example-kontrol.yml](.github/workflows/example-kontrol.yml).

### Any CI via the HTTP API

Point any job at a running KONTROL API. The body can be plain JSON **or the raw Dockerfile itself**, and the response format is chosen with `?format=` or the `Accept` header.

```bash
# Markdown report straight from the Dockerfile on disk
curl -sS -X POST "$KONTROL_URL/api/scan?source=Dockerfile" \
  -H "Content-Type: text/plain" -H "Accept: text/markdown" \
  --data-binary @Dockerfile > kontrol-report.md

# JSON + gate on the score header without parsing the body
score=$(curl -sS -D - -o result.json -X POST "$KONTROL_URL/api/scan" \
  -H "Content-Type: text/plain" --data-binary @Dockerfile \
  | awk 'tolower($1)=="x-kontrol-score:"{print $2}' | tr -d '\r')
[ "$score" -ge 70 ] || { echo "KONTROL score $score < 70"; exit 1; }

# SARIF for code-scanning uploads
curl -sS -X POST "$KONTROL_URL/api/scan?format=sarif" \
  -H "Content-Type: text/plain" --data-binary @Dockerfile > kontrol.sarif
```

GitLab CI example:

```yaml
kontrol:
  image: node:20-alpine
  script:
    - npx kontrol-audit Dockerfile --format md --output kontrol-report.md --fail-on high
  artifacts:
    when: always
    paths: [kontrol-report.md]
```

### Output formats

| Format | Content type | Use it for |
| --- | --- | --- |
| `text` | `text/plain` | Human-readable terminal output (colored on TTYs) |
| `json` | `application/json` | Dashboards, custom gates, archiving results |
| `md` | `text/markdown` | PR comments, job summaries, wiki pages |
| `sarif` | `application/sarif+json` | GitHub code scanning, Azure DevOps, any SARIF viewer |

All formats are produced by [backend/lib/engine.js](backend/lib/engine.js), so the CLI and the API always agree.

---

## API Reference

### `GET /api/health`

Liveness probe.

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-10-23T10:15:30.000Z",
  "rulesLoadedCount": 7,
  "formats": ["json", "md", "text", "sarif"]
}
```

### `GET /api/rules`

Returns the active rule set (without compiled regex objects).

### `POST /api/scan`

**Request body** - either of:

| Content-Type | Body |
| --- | --- |
| `application/json` | `{ "content": "<dockerfile>", "source": "optional/label" }` |
| `text/plain` (or any `text/*`) | The raw Dockerfile |

**Response format** - first match wins:

1. `?format=json|md|text|sarif` query parameter
2. `Accept` header: `application/sarif+json`, `text/markdown`, `text/plain`, `application/json`
3. Default: JSON

Every response also carries `X-Kontrol-Score`, `X-Kontrol-Grade` and `X-Kontrol-Findings` headers so gates can be written without parsing the body. An optional `?source=` label is echoed back and used as the file name in Markdown and SARIF output.

**JSON response `200 OK`**

```json
{
  "source": "Dockerfile",
  "score": 30,
  "grade": "F",
  "findingsCount": 4,
  "severityBreakdown": { "High": 2, "Medium": 1, "Low": 1 },
  "findings": [
    {
      "id": "SEC-001",
      "title": "Container runs as root user",
      "severity": "High",
      "description": "...",
      "remediation": "RUN addgroup --system app && adduser --system --ingroup app app\nUSER app",
      "negativeCheck": false,
      "deduction": 25,
      "evidence": [{ "line": 2, "snippet": "USER root" }]
    }
  ],
  "badge": {
    "url": "https://img.shields.io/badge/KONTROL%20Security-30/100%20(Grade%20F)-red?style=flat-square&logo=docker&logoColor=white",
    "markdown": "[![KONTROL Security Score](https://img.shields.io/...)](https://github.com/mayurbagade456/kontrol)"
  },
  "rulesEvaluated": 7,
  "linesScanned": 2,
  "scannedAt": "2026-10-23T10:15:31.000Z",
  "engine": "server"
}
```

**Error responses**

| Status | Condition |
| --- | --- |
| `400` | Missing body, missing/non-string/empty `content`, malformed JSON, or unknown `format` |
| `413` | `content` exceeds `MAX_CONTENT_CHARS` or the request body exceeds 512 KB |
| `404` | Unknown route |
| `500` | Unexpected server error (details are logged, never leaked) |

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Port the API listens on |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins, or `*` |
| `RULES_PATH` | `rules.json` | Rule file path relative to `backend/` |
| `MAX_CONTENT_CHARS` | `200000` | Maximum Dockerfile size accepted |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | *(empty)* | Absolute API origin for production builds; empty uses the dev proxy |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` | Backend target for the Vite dev proxy |
| `VITE_GITHUB_URL` | repo URL | Link rendered in the header |

---

## Offline Fallback Engine

The dashboard never hard-fails when the API is down:

1. `App.jsx` polls `GET /api/health` and surfaces the state in the header (**API Online** / **Offline Mode**).
2. `POST /api/scan` is wrapped in a timeout-aware `try/catch`.
3. Network errors, timeouts, and `5xx` responses trigger `scanLocally()` from `lib/auditEngine.js`, which implements the same rule semantics and scoring model.
4. `4xx` validation errors are shown to the user as-is and do **not** trigger the fallback, so input mistakes are never masked.
5. Results are labelled **Server engine** or **Client engine** so provenance is always visible.

---

## Extending the Rule Set

Add an object to `backend/rules.json`:

```json
{
  "id": "SEC-008",
  "title": "Package manager cache not cleaned",
  "severity": "Low",
  "description": "apt-get install without cleaning /var/lib/apt/lists bloats the image and ships stale metadata.",
  "matchPattern": "^\\s*RUN\\b(?=.*apt-get\\s+install)(?!.*rm\\s+-rf\\s+/var/lib/apt/lists).*$",
  "negativeCheck": false,
  "remediation": "RUN apt-get update && apt-get install -y --no-install-recommends curl \\\n  && rm -rf /var/lib/apt/lists/*"
}
```

Guidelines:

- `id` must be unique; `severity` must be `High`, `Medium`, or `Low`.
- Patterns are compiled with `gim`, so use `^`/`$` for per-line anchoring.
- Set `negativeCheck: true` when the **absence** of a match is the violation.
- Validate your file with `npm run check` inside `backend/`, then try it: `node backend/cli.js examples/insecure.Dockerfile`.
- Mirror the rule in `frontend/src/lib/auditEngine.js` to keep offline parity.
- Pipelines can point at a different rule file with `kontrol --rules path/to/rules.json` or `RULES_PATH` on the server.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Keep rules declarative and remediation snippets copy-paste ready.
3. Before opening a pull request, run:
   - `npm run check` in `backend/` (validates `rules.json`)
   - `node backend/cli.js examples/insecure.Dockerfile examples/hardened.Dockerfile --format json` (engine + CLI smoke test)
   - `npm run build` in `frontend/`
4. Changes to scoring or rule semantics must be applied to both `backend/lib/engine.js` and `frontend/src/lib/auditEngine.js`.
5. Describe the risk your change addresses and include a sample Dockerfile that exercises it (add it under `examples/`).

---

## License

```
MIT License

Copyright (c) 2026 Mayur Bagade

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
