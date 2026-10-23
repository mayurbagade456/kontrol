#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const engine = require('./lib/engine');
const { version: APP_VERSION } = require('./package.json');

const EXIT_OK = 0;
const EXIT_POLICY_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_ERROR = 3;

const HELP = `KONTROL ${APP_VERSION} — container security & configuration audit

Usage
  kontrol [options] <file...>
  cat Dockerfile | kontrol [options] -

Options
  -f, --format <fmt>      Output format: text (default), json, md, sarif
  -o, --output <file>     Write the report to a file instead of stdout
      --fail-on <sev>     Exit 1 if any finding is at/above: high, medium, low (default: none)
      --min-score <n>     Exit 1 if the score is below <n> (0-100)
      --rules <path>      Use a custom rules.json
      --api <url>         Scan through a remote KONTROL API instead of the local engine
      --no-color          Disable ANSI colors in text output
  -q, --quiet             Suppress the report; only exit codes and errors are emitted
  -h, --help              Show this help
  -v, --version           Print the version

Exit codes
  0  audit passed the configured policy
  1  policy failed (--fail-on / --min-score)
  2  invalid usage
  3  runtime error (unreadable file, API unreachable, ...)

Examples
  kontrol Dockerfile
  kontrol Dockerfile --format json > kontrol.json
  kontrol Dockerfile --format md --output kontrol-report.md
  kontrol Dockerfile --format sarif --output kontrol.sarif
  kontrol services/*/Dockerfile --fail-on high --min-score 70
  docker run --rm -i ghcr.io/example/kontrol - < Dockerfile
`;

class CliExit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.name = 'CliExit';
    this.code = code;
  }
}

function fail(message, code) {
  process.stderr.write(`kontrol: ${message}\n`);
  throw new CliExit(code);
}

function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string', short: 'f', default: 'text' },
        output: { type: 'string', short: 'o' },
        'fail-on': { type: 'string', default: 'none' },
        'min-score': { type: 'string' },
        rules: { type: 'string' },
        api: { type: 'string' },
        'no-color': { type: 'boolean', default: false },
        quiet: { type: 'boolean', short: 'q', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (err) {
    fail(`${err.message}\n\n${HELP}`, EXIT_USAGE);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    throw new CliExit(EXIT_OK);
  }

  if (values.version) {
    process.stdout.write(`${APP_VERSION}\n`);
    throw new CliExit(EXIT_OK);
  }

  const format = values.format.toLowerCase() === 'markdown' ? 'md' : values.format.toLowerCase();
  if (!engine.OUTPUT_FORMATS.includes(format)) {
    fail(`unknown format "${values.format}" (expected ${engine.OUTPUT_FORMATS.join(', ')})`, EXIT_USAGE);
  }

  const failOnRaw = values['fail-on'].toLowerCase();
  const failOnMap = { none: 'none', high: 'High', medium: 'Medium', low: 'Low' };
  if (!(failOnRaw in failOnMap)) {
    fail(`invalid --fail-on "${values['fail-on']}" (expected high, medium, low or none)`, EXIT_USAGE);
  }

  let minScore = null;
  if (values['min-score'] !== undefined) {
    minScore = Number(values['min-score']);
    if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
      fail(`invalid --min-score "${values['min-score']}" (expected an integer 0-100)`, EXIT_USAGE);
    }
  }

  if (positionals.length === 0) {
    fail(`no input files given\n\n${HELP}`, EXIT_USAGE);
  }

  return {
    files: positionals,
    format,
    output: values.output || null,
    failOn: failOnMap[failOnRaw],
    minScore,
    rulesPath: values.rules ? path.resolve(process.cwd(), values.rules) : path.join(__dirname, 'rules.json'),
    api: values.api ? values.api.replace(/\/+$/, '') : null,
    color: !values['no-color'] && !process.env.NO_COLOR && process.stdout.isTTY && !values.output,
    quiet: values.quiet,
  };
}

function readInput(file) {
  if (file === '-') {
    return { source: 'stdin', content: fs.readFileSync(0, 'utf8') };
  }
  const resolved = path.resolve(process.cwd(), file);
  const content = fs.readFileSync(resolved, 'utf8');
  return { source: path.relative(process.cwd(), resolved) || file, content };
}

async function scanRemote(api, content, source) {
  const response = await fetch(`${api}/api/scan?source=${encodeURIComponent(source)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ content }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}${payload && payload.error ? `: ${payload.error}` : ''}`);
  }
  return payload;
}

async function main() {
  const options = parseCli(process.argv.slice(2));

  let rules;
  try {
    rules = engine.loadRules(options.rulesPath);
  } catch (err) {
    fail(err.message, EXIT_ERROR);
  }

  const results = [];
  let policyPassed = true;
  const policyReasons = [];

  for (const file of options.files) {
    let input;
    try {
      input = readInput(file);
    } catch (err) {
      fail(`cannot read ${file}: ${err.message}`, EXIT_ERROR);
    }

    if (input.content.trim() === '') {
      fail(`${input.source} is empty`, EXIT_ERROR);
    }

    let result;
    if (options.api) {
      try {
        result = await scanRemote(options.api, input.content, input.source);
        result.source = result.source || input.source;
      } catch (err) {
        fail(`remote scan failed for ${input.source}: ${err.message}`, EXIT_ERROR);
      }
    } else {
      result = engine.scanContent(input.content, rules, { source: input.source, engine: 'cli' });
    }

    const verdict = engine.evaluatePolicy(result, { failOn: options.failOn, minScore: options.minScore });
    if (!verdict.passed) {
      policyPassed = false;
      for (const reason of verdict.reasons) {
        policyReasons.push(`${input.source}: ${reason}`);
      }
    }

    results.push(result);
  }

  let report;
  if (options.format === 'json') {
    report = JSON.stringify(results.length === 1 ? results[0] : results, null, 2);
  } else if (options.format === 'sarif') {
    const sarifRuns = results.map((result) => engine.renderSarif(result, rules, { version: APP_VERSION }).runs[0]);
    report = JSON.stringify({ ...engine.renderSarif(results[0], rules, { version: APP_VERSION }), runs: sarifRuns }, null, 2);
  } else {
    report = results
      .map((result) => engine.renderReport(options.format, result, rules, { color: options.color, version: APP_VERSION }))
      .join(options.format === 'md' ? '\n\n---\n\n' : '\n');
  }

  if (options.output) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
      fs.writeFileSync(options.output, `${report}\n`, 'utf8');
    } catch (err) {
      fail(`cannot write ${options.output}: ${err.message}`, EXIT_ERROR);
    }
    if (!options.quiet) {
      process.stderr.write(`kontrol: report written to ${options.output}\n`);
    }
  } else if (!options.quiet) {
    process.stdout.write(`${report}\n`);
  }

  if (!policyPassed) {
    process.stderr.write(`kontrol: policy failed\n${policyReasons.map((r) => `  - ${r}`).join('\n')}\n`);
    process.exitCode = EXIT_POLICY_FAILED;
    return;
  }

  process.exitCode = EXIT_OK;
}

main().catch((err) => {
  if (err instanceof CliExit) {
    process.exitCode = err.code;
    return;
  }
  process.stderr.write(`kontrol: ${err && err.message ? err.message : String(err)}\n`);
  process.exitCode = EXIT_ERROR;
});
