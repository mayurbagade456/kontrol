export const SEVERITY_DEDUCTIONS = Object.freeze({ High: 25, Medium: 15, Low: 5 });

export const CLIENT_RULES = Object.freeze([
  {
    id: 'SEC-001',
    title: 'Container runs as root user',
    severity: 'High',
    description:
      'The image explicitly switches to the root user (UID 0). A process compromise inside the container grants full privileges, dramatically increasing the blast radius of any exploit and simplifying container breakout attempts.',
    matchPattern: '^\\s*USER\\s+(?:root|0)(?::\\S+)?\\s*(?:#.*)?$',
    negativeCheck: false,
    remediation: 'RUN addgroup --system app && adduser --system --ingroup app app\nUSER app',
  },
  {
    id: 'SEC-002',
    title: 'Mutable base image tag (:latest)',
    severity: 'High',
    description:
      "The base image is pulled using the floating ':latest' tag. Builds become non-reproducible, silently inherit upstream breaking changes, and bypass vulnerability review because the actual image content changes over time.",
    matchPattern:
      '^\\s*FROM\\s+(?:--platform=\\S+\\s+)?\\S+:latest(?:@sha256:[a-f0-9]{64})?(?:\\s+AS\\s+\\S+)?\\s*(?:#.*)?$',
    negativeCheck: false,
    remediation:
      'FROM node:20.11.1-alpine3.19\n# Prefer pinning to an immutable digest for fully reproducible builds:\n# FROM node:20.11.1-alpine3.19@sha256:<digest>',
  },
  {
    id: 'SEC-003',
    title: 'Sensitive database or cache port exposed',
    severity: 'Medium',
    description:
      'The image documents exposure of a database or cache port (MySQL 3306, MongoDB 27017, Redis 6379, PostgreSQL 5432). Application containers should never expose data-store ports; doing so signals a co-located datastore or an unnecessary attack surface on the network.',
    matchPattern: '^\\s*EXPOSE\\b[^\\n#]*\\b(?:3306|27017|6379|5432)\\b',
    negativeCheck: false,
    remediation: '# Expose only the application port and run datastores as separate services\nEXPOSE 8080',
  },
  {
    id: 'SEC-004',
    title: 'Missing WORKDIR instruction',
    severity: 'Low',
    description:
      "No WORKDIR instruction was found. Without it, RUN, COPY, and CMD instructions execute relative to the filesystem root, which encourages writing application files into '/' and makes path handling fragile and error-prone.",
    matchPattern: '^\\s*WORKDIR\\s+\\S+',
    negativeCheck: true,
    remediation: 'WORKDIR /usr/src/app\nCOPY package*.json ./',
  },
  {
    id: 'SEC-005',
    title: 'Missing HEALTHCHECK instruction',
    severity: 'Medium',
    description:
      'No HEALTHCHECK instruction was found. Orchestrators cannot distinguish a hung or deadlocked process from a healthy one, so failing containers keep receiving traffic instead of being restarted or drained.',
    matchPattern: '^\\s*HEALTHCHECK\\b',
    negativeCheck: true,
    remediation:
      'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\\n  CMD wget -qO- http://127.0.0.1:8080/health || exit 1',
  },
  {
    id: 'SEC-006',
    title: 'Hard-coded secret in ENV or ARG',
    severity: 'High',
    description:
      'An ENV or ARG instruction appears to embed a credential (password, token, API key, or private key). Values set this way are baked into image layers and build history, where anyone with pull access can recover them.',
    matchPattern:
      '^\\s*(?:ENV|ARG)\\s+\\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)\\w*[ \\t=]+[^\\s#]+',
    negativeCheck: false,
    remediation:
      '# Inject secrets at runtime or via BuildKit secret mounts instead of ENV/ARG\nRUN --mount=type=secret,id=npm_token \\\n  NPM_TOKEN=$(cat /run/secrets/npm_token) npm ci',
  },
  {
    id: 'SEC-007',
    title: 'ADD used instead of COPY',
    severity: 'Low',
    description:
      'ADD supports remote URL fetching and automatic archive extraction, both of which introduce supply-chain and path-traversal risks. COPY is explicit and predictable for local files.',
    matchPattern: '^\\s*ADD\\s+[^\\n]+',
    negativeCheck: false,
    remediation: 'COPY --chown=app:app . ./',
  },
]);

const compiledRules = CLIENT_RULES.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.matchPattern, 'gim'),
}));

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

export function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function scanLocally(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('Paste a Dockerfile before running an audit.');
  }

  const lineStarts = buildLineStarts(content);
  const findings = [];
  const severityBreakdown = { High: 0, Medium: 0, Low: 0 };
  let score = 100;

  for (const rule of compiledRules) {
    const evidence = collectEvidence(rule, content, lineStarts);
    const triggered = rule.negativeCheck ? evidence.length === 0 : evidence.length > 0;
    if (!triggered) {
      continue;
    }

    const deduction = SEVERITY_DEDUCTIONS[rule.severity];
    findings.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      description: rule.description,
      remediation: rule.remediation,
      negativeCheck: rule.negativeCheck,
      deduction,
      evidence: rule.negativeCheck ? [] : evidence,
    });
    severityBreakdown[rule.severity] += 1;
    score -= deduction;
  }

  score = Math.max(0, score);

  return {
    score,
    grade: gradeFor(score),
    findingsCount: findings.length,
    severityBreakdown,
    findings,
    rulesEvaluated: compiledRules.length,
    linesScanned: lineStarts.length,
    scannedAt: new Date().toISOString(),
    engine: 'client',
  };
}

export const SAMPLE_DOCKERFILE = `# Sample service image - intentionally insecure for demonstration
FROM node:latest

ENV NODE_ENV=production
ENV PORT=3000

ADD . /app
RUN cd /app && npm install --production

EXPOSE 3000 5432

USER root

CMD ["node", "/app/server.js"]
`;
