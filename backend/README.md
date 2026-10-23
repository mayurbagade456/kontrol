# kontrol-audit

Dockerfile security & configuration audit. Scores a Dockerfile 0-100, grades it A-F, and prints the exact fix for every finding. Outputs `text`, `json`, `md` or SARIF and exits non-zero when your policy fails, so it drops straight into CI.

Part of [KONTROL](https://github.com/mayurbagade456/kontrol) - the same engine also powers the hosted dashboard, the HTTP API and the GitHub Action.

## Usage

```bash
# No install
npx kontrol-audit Dockerfile

# Or install globally
npm i -g kontrol-audit
kontrol Dockerfile
```

```
kontrol [options] <file...>
cat Dockerfile | kontrol [options] -

  -f, --format <fmt>      text (default), json, md, sarif
  -o, --output <file>     Write the report to a file
      --fail-on <sev>     Exit 1 on findings at/above: high, medium, low
      --min-score <n>     Exit 1 if score < n
      --rules <path>      Custom rules.json
      --api <url>         Scan via a remote KONTROL API
      --no-color          Disable ANSI colors
  -q, --quiet             Only exit codes and errors
```

Exit codes: `0` passed, `1` policy failed, `2` usage error, `3` runtime error.

## Examples

```bash
kontrol Dockerfile --fail-on high --min-score 70
kontrol services/*/Dockerfile --format md --output kontrol-report.md
kontrol Dockerfile --format sarif --output kontrol.sarif
kontrol Dockerfile --format json | jq '.score, .grade'
```

## Rules

| ID | Finding | Severity |
| --- | --- | --- |
| SEC-001 | Container runs as root | High |
| SEC-002 | Mutable `:latest` base image | High |
| SEC-003 | Database/cache port exposed | Medium |
| SEC-004 | Missing `WORKDIR` | Low |
| SEC-005 | Missing `HEALTHCHECK` | Medium |
| SEC-006 | Hard-coded secret in `ENV`/`ARG` | High |
| SEC-007 | `ADD` instead of `COPY` | Low |

Score starts at 100; High -25, Medium -15, Low -5. Grades: A 90+, B 75+, C 60+, D 40+, F below.

## Run the API

```bash
npm i kontrol-audit
PORT=4000 node node_modules/kontrol-audit/server.js
curl -X POST localhost:4000/api/scan -H "Content-Type: text/plain" --data-binary @Dockerfile
```

MIT - see the [repository](https://github.com/mayurbagade456/kontrol) for full documentation.
