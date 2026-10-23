'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const engine = require('./lib/engine');
const { version: APP_VERSION } = require('./package.json');

const PORT = Number.parseInt(process.env.PORT, 10) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RULES_PATH = path.resolve(__dirname, process.env.RULES_PATH || 'rules.json');
const MAX_CONTENT_CHARS = Number.parseInt(process.env.MAX_CONTENT_CHARS, 10) || 200_000;
const BODY_LIMIT = '512kb';

const FORMAT_ALIASES = Object.freeze({
  json: 'json',
  md: 'md',
  markdown: 'md',
  text: 'text',
  txt: 'text',
  plain: 'text',
  sarif: 'sarif',
});

const ACCEPT_FORMATS = Object.freeze([
  ['application/sarif+json', 'sarif'],
  ['text/markdown', 'md'],
  ['text/plain', 'text'],
  ['application/json', 'json'],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function resolveFormat(req) {
  const requested = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : null;
  if (requested) {
    const format = FORMAT_ALIASES[requested];
    if (!format) {
      throw new HttpError(400, `Unsupported format "${req.query.format}". Use one of: json, md, text, sarif.`);
    }
    return format;
  }

  const accept = (req.headers.accept || '').toLowerCase();
  for (const [mime, format] of ACCEPT_FORMATS) {
    if (accept.includes(mime)) {
      return format;
    }
  }
  return 'json';
}

function extractContent(req) {
  const body = req.body;

  if (typeof body === 'string') {
    return body;
  }

  if (body === undefined || body === null || Buffer.isBuffer(body) || (typeof body === 'object' && Object.keys(body).length === 0 && !req.is('json'))) {
    throw new HttpError(400, 'Request body is required. Send JSON {"content": "..."} or a raw Dockerfile with Content-Type: text/plain.');
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object with a "content" field.');
  }

  if (body.content === undefined || body.content === null) {
    throw new HttpError(400, 'Field "content" is required.');
  }

  if (typeof body.content !== 'string') {
    throw new HttpError(400, 'Field "content" must be a string.');
  }

  return body.content;
}

function validateContent(content) {
  if (content.trim() === '') {
    throw new HttpError(400, 'Field "content" must be a non-empty string. Paste a Dockerfile to audit.');
  }

  if (content.length > MAX_CONTENT_CHARS) {
    throw new HttpError(413, `Field "content" exceeds the maximum size of ${MAX_CONTENT_CHARS} characters.`);
  }

  return content;
}

function resolveSource(req) {
  const fromQuery = typeof req.query.source === 'string' ? req.query.source : null;
  const fromBody = req.body && typeof req.body === 'object' && typeof req.body.source === 'string' ? req.body.source : null;
  const source = (fromQuery || fromBody || '').trim();
  return source ? source.slice(0, 200) : null;
}

function createApp(rules) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const allowedOrigins = CORS_ORIGIN === '*'
    ? '*'
    : CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

  app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 600,
  }));

  app.use(express.json({ limit: BODY_LIMIT, strict: true }));
  app.use(express.text({ limit: BODY_LIMIT, type: ['text/*', 'application/x-dockerfile'] }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      rulesLoadedCount: rules.length,
      formats: engine.OUTPUT_FORMATS,
    });
  });

  app.get('/api/rules', (req, res) => {
    res.status(200).json({
      count: rules.length,
      rules: rules.map(({ regex, ...rule }) => rule),
    });
  });

  app.post('/api/scan', (req, res, next) => {
    try {
      const format = resolveFormat(req);
      const content = validateContent(extractContent(req));
      const result = engine.scanContent(content, rules, { source: resolveSource(req) });

      res.setHeader('X-Kontrol-Score', String(result.score));
      res.setHeader('X-Kontrol-Grade', result.grade);
      res.setHeader('X-Kontrol-Findings', String(result.findingsCount));

      if (format === 'json') {
        res.status(200).json(result);
        return;
      }

      res.status(200).type(engine.CONTENT_TYPES[format]).send(engine.renderReport(format, result, rules, { version: APP_VERSION }));
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }

    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body contains malformed JSON.' });
      return;
    }

    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }

    console.error(`[kontrol] Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

function start() {
  let rules;
  try {
    rules = engine.loadRules(RULES_PATH);
  } catch (err) {
    console.error(`[kontrol] Fatal: ${err.message}`);
    process.exit(1);
  }

  const app = createApp(rules);
  const server = app.listen(PORT, () => {
    console.log(`[kontrol] API v${APP_VERSION} listening on http://localhost:${PORT}`);
    console.log(`[kontrol] Loaded ${rules.length} security rule(s) from ${RULES_PATH}`);
  });

  const shutdown = (signal) => {
    console.log(`[kontrol] Received ${signal}, shutting down gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  createApp,
  loadRules: engine.loadRules,
  scanContent: engine.scanContent,
  gradeFor: engine.gradeFor,
  SEVERITY_DEDUCTIONS: engine.SEVERITY_DEDUCTIONS,
};
