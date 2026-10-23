'use strict';

const fs = require('fs');

const SEVERITY_DEDUCTIONS = Object.freeze({ High: 25, Medium: 15, Low: 5 });
const SEVERITY_ORDER = Object.freeze({ High: 0, Medium: 1, Low: 2 });
const VALID_SEVERITIES = Object.freeze(Object.keys(SEVERITY_DEDUCTIONS));
const REQUIRED_STRING_FIELDS = Object.freeze(['id', 'title', 'severity', 'description', 'matchPattern', 'remediation']);
const REPO_URL = 'https://github.com/mayurbagade456/kontrol';
const OUTPUT_FORMATS = Object.freeze(['json', 'md', 'text', 'sarif']);

function loadRules(rulesPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch (err) {
    throw new Error(`Unable to read rules file at ${rulesPath}: ${err.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('rules.json must contain a non-empty array of rules');
  }

  const seenIds = new Set();

  return parsed.map((rule, index) => {
    const label = `rules[${index}]`;

    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error(`${label} must be an object`);
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      if (typeof rule[field] !== 'string' || rule[field].trim() === '') {
        throw new Error(`${label} is missing required string field "${field}"`);
      }
    }

    if (!VALID_SEVERITIES.includes(rule.severity)) {
      throw new Error(`${label} has invalid severity "${rule.severity}" (expected ${VALID_SEVERITIES.join(', ')})`);
    }

    if (typeof rule.negativeCheck !== 'boolean') {
      throw new Error(`${label} must define boolean field "negativeCheck"`);
    }

    if (seenIds.has(rule.id)) {
      throw new Error(`Duplicate rule id "${rule.id}"`);
    }
    seenIds.add(rule.id);

    let regex;
    try {
      regex = new RegExp(rule.matchPattern, 'gim');
    } catch (err) {
      throw new Error(`${label} (${rule.id}) has an invalid matchPattern: ${err.message}`);
    }

    return Object.freeze({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      description: rule.description,
      matchPattern: rule.matchPattern,
      negativeCheck: rule.negativeCheck,
      remediation: rule.remediation,
      regex,
    });
  });
}

function buildLineStarts(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberAt(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (lineStarts[mid] <= index) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low + 1;
}

function collectEvidence(rule, content, lineStarts) {
  const evidence = [];
  const seenLines = new Set();

  for (const match of content.matchAll(rule.regex)) {
    const line = lineNumberAt(lineStarts, match.index);
    if (seenLines.has(line)) {
      continue;
    }
    seenLines.add(line);
    evidence.push({ line, snippet: match[0].trim().slice(0, 200) });
  }

  return evidence;
}

function evaluateRule(rule, content, lineStarts) {
  const evidence = collectEvidence(rule, content, lineStarts);
  const triggered = rule.negativeCheck ? evidence.length === 0 : evidence.length > 0;

  if (!triggered) {
    return null;
  }

  return {
    id: rule.id,
    title: rule.title,
    severity: rule.severity,
    description: rule.description,
    remediation: rule.remediation,
    negativeCheck: rule.negativeCheck,
    deduction: SEVERITY_DEDUCTIONS[rule.severity],
    evidence: rule.negativeCheck ? [] : evidence,
  };
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function badgeColorFor(score) {
  if (score >= 90) return 'brightgreen';
  if (score >= 75) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function escapeShieldsSegment(value) {
  return String(value).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '%20');
}

function buildBadge(score, grade) {
  const label = escapeShieldsSegment('KONTROL Security');
  const message = escapeShieldsSegment(`${score}/100 (Grade ${grade})`);
  const url = `https://img.shields.io/badge/${label}-${message}-${badgeColorFor(score)}?style=flat-square&logo=docker&logoColor=white`;
  return {
    url,
    markdown: `[![KONTROL Security Score](${url})](${REPO_URL})`,
  };
}

function scanContent(content, rules, options = {}) {
  const lineStarts = buildLineStarts(content);
  const findings = [];
  const severityBreakdown = { High: 0, Medium: 0, Low: 0 };
  let score = 100;

  for (const rule of rules) {
    const finding = evaluateRule(rule, content, lineStarts);
    if (finding) {
      findings.push(finding);
      severityBreakdown[finding.severity] += 1;
      score -= finding.deduction;
    }
  }

  score = Math.max(0, score);
  const grade = gradeFor(score);

  return {
    source: options.source || null,
    score,
    grade,
    findingsCount: findings.length,
    severityBreakdown,
    findings,
    badge: buildBadge(score, grade),
    rulesEvaluated: rules.length,
    linesScanned: lineStarts.length,
    scannedAt: new Date().toISOString(),
    engine: options.engine || 'server',
  };
}

function meetsSeverity(severity, threshold) {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

function evaluatePolicy(result, policy = {}) {
  const reasons = [];
  const failOn = policy.failOn && policy.failOn !== 'none' ? policy.failOn : null;
  const minScore = Number.isFinite(policy.minScore) ? policy.minScore : null;

  if (failOn) {
    const breaching = result.findings.filter((f) => meetsSeverity(f.severity, failOn));
    if (breaching.length > 0) {
      reasons.push(`${breaching.length} finding(s) at or above ${failOn} severity: ${breaching.map((f) => f.id).join(', ')}`);
    }
  }

  if (minScore !== null && result.score < minScore) {
    reasons.push(`score ${result.score} is below the required minimum of ${minScore}`);
  }

  return { passed: reasons.length === 0, reasons };
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(result) {
  const lines = [];
  const title = result.source ? `KONTROL Security Report - \`${result.source}\`` : 'KONTROL Security Report';

  lines.push(`# ${title}`, '');
  lines.push(`![KONTROL Security Score](${result.badge.url})`, '');
  lines.push('| Score | Grade | Findings | High | Medium | Low | Rules | Scanned |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  lines.push(
    `| **${result.score}/100** | **${result.grade}** | ${result.findingsCount} | ${result.severityBreakdown.High} | ${result.severityBreakdown.Medium} | ${result.severityBreakdown.Low} | ${result.rulesEvaluated} | ${result.scannedAt} |`,
    '',
  );

  if (result.findingsCount === 0) {
    lines.push('## Findings', '', '**No vulnerabilities found.** All rules passed.', '');
    return lines.join('\n');
  }

  lines.push('## Findings', '');
  for (const finding of sortFindings(result.findings)) {
    lines.push(`### ${finding.id} - ${finding.title}`, '');
    lines.push(`**Severity:** ${finding.severity} (-${finding.deduction} pts)${finding.negativeCheck ? ' - *missing instruction*' : ''}`, '');
    lines.push(finding.description, '');

    if (finding.evidence.length > 0) {
      lines.push('**Evidence**', '', '| Line | Snippet |', '| --- | --- |');
      for (const item of finding.evidence) {
        lines.push(`| ${item.line} | \`${escapeMarkdownCell(item.snippet)}\` |`);
      }
      lines.push('');
    }

    lines.push('**Remediation**', '', '```dockerfile', finding.remediation, '```', '');
  }

  lines.push('---', '', `Generated by [KONTROL](${REPO_URL}).`, '');
  return lines.join('\n');
}

function renderText(result, options = {}) {
  const color = options.color
    ? {
        bold: (s) => `\u001b[1m${s}\u001b[22m`,
        dim: (s) => `\u001b[2m${s}\u001b[22m`,
        red: (s) => `\u001b[31m${s}\u001b[39m`,
        yellow: (s) => `\u001b[33m${s}\u001b[39m`,
        cyan: (s) => `\u001b[36m${s}\u001b[39m`,
        green: (s) => `\u001b[32m${s}\u001b[39m`,
      }
    : { bold: (s) => s, dim: (s) => s, red: (s) => s, yellow: (s) => s, cyan: (s) => s, green: (s) => s };

  const severityColor = { High: color.red, Medium: color.yellow, Low: color.cyan };
  const lines = [];

  lines.push(color.bold(`KONTROL  ${result.source || 'stdin'}`));
  lines.push(
    `Score ${color.bold(`${result.score}/100`)}  Grade ${color.bold(result.grade)}  ` +
      `Findings ${result.findingsCount} (H${result.severityBreakdown.High} M${result.severityBreakdown.Medium} L${result.severityBreakdown.Low})  ` +
      color.dim(`${result.rulesEvaluated} rules`),
  );
  lines.push('');

  if (result.findingsCount === 0) {
    lines.push(color.green('No vulnerabilities found.'));
    return lines.join('\n');
  }

  for (const finding of sortFindings(result.findings)) {
    const paint = severityColor[finding.severity] || ((s) => s);
    lines.push(`${paint(color.bold(`[${finding.severity.toUpperCase()}]`))} ${finding.id}  ${finding.title}  ${color.dim(`(-${finding.deduction})`)}`);
    for (const item of finding.evidence) {
      lines.push(`    ${color.dim(`L${item.line}`)}  ${item.snippet}`);
    }
    if (finding.evidence.length === 0) {
      lines.push(`    ${color.dim('missing instruction')}`);
    }
    lines.push(`    ${color.dim('fix:')} ${finding.remediation.split('\n').join(`\n         `)}`);
    lines.push('');
  }

  return lines.join('\n');
}

function sarifLevelFor(severity) {
  if (severity === 'High') return 'error';
  if (severity === 'Medium') return 'warning';
  return 'note';
}

function renderSarif(result, rules, options = {}) {
  const artifactUri = (result.source || 'Dockerfile').replace(/\\/g, '/');
  const ruleIndex = new Map(rules.map((rule, index) => [rule.id, index]));

  const results = [];
  for (const finding of sortFindings(result.findings)) {
    const base = {
      ruleId: finding.id,
      ruleIndex: ruleIndex.get(finding.id),
      level: sarifLevelFor(finding.severity),
      message: { text: `${finding.title}. ${finding.description}` },
    };

    if (finding.evidence.length === 0) {
      results.push({
        ...base,
        locations: [{ physicalLocation: { artifactLocation: { uri: artifactUri }, region: { startLine: 1 } } }],
      });
      continue;
    }

    for (const item of finding.evidence) {
      results.push({
        ...base,
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: artifactUri },
              region: { startLine: item.line, snippet: { text: item.snippet } },
            },
          },
        ],
      });
    }
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'KONTROL',
            version: options.version || '1.0.0',
            informationUri: REPO_URL,
            rules: rules.map((rule) => ({
              id: rule.id,
              name: rule.title.replace(/[^A-Za-z0-9]+/g, ''),
              shortDescription: { text: rule.title },
              fullDescription: { text: rule.description },
              help: { text: rule.remediation, markdown: `\`\`\`dockerfile\n${rule.remediation}\n\`\`\`` },
              defaultConfiguration: { level: sarifLevelFor(rule.severity) },
              properties: { severity: rule.severity, deduction: SEVERITY_DEDUCTIONS[rule.severity], negativeCheck: rule.negativeCheck },
            })),
          },
        },
        properties: { score: result.score, grade: result.grade, scannedAt: result.scannedAt },
        results,
      },
    ],
  };
}

function renderReport(format, result, rules, options = {}) {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);
    case 'md':
      return renderMarkdown(result);
    case 'text':
      return renderText(result, options);
    case 'sarif':
      return JSON.stringify(renderSarif(result, rules, options), null, 2);
    default:
      throw new Error(`Unsupported output format "${format}" (expected ${OUTPUT_FORMATS.join(', ')})`);
  }
}

const CONTENT_TYPES = Object.freeze({
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  sarif: 'application/sarif+json; charset=utf-8',
});

module.exports = {
  SEVERITY_DEDUCTIONS,
  SEVERITY_ORDER,
  VALID_SEVERITIES,
  OUTPUT_FORMATS,
  CONTENT_TYPES,
  REPO_URL,
  loadRules,
  scanContent,
  gradeFor,
  buildBadge,
  evaluatePolicy,
  renderMarkdown,
  renderText,
  renderSarif,
  renderReport,
};
