/**
 * Cloudflare Pages Function — bug report endpoint.
 *
 * Receives bug reports from the in-app modal, validates origin, rate-limits
 * per IP via KV, and creates a GitHub issue.
 *
 * Bindings required (configure in Cloudflare dashboard → Pages → Settings → Functions):
 *   - KV namespace: BUG_REPORT_RATELIMIT
 *   - Environment variable: GITHUB_REPO (e.g. "MichalMarvan/BIM_checker")
 *   - Secret: GITHUB_TOKEN (fine-grained PAT with Issues: Read and Write on the repo)
 */

const ALLOWED_ORIGINS = new Set([
    'https://checkthebim.com',
    'https://www.checkthebim.com',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://raspberrypi:8000'
]);

const HOUR_LIMIT = 5;
const DAY_LIMIT = 20;
const HOUR_TTL = 3600;
const DAY_TTL = 86400;

const MAX_TITLE = 120;
const MAX_DESC = 5000;
const MAX_STEPS = 2000;

function corsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://checkthebim.com';
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

function jsonResponse(body, status, origin, extraHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
            ...(extraHeaders || {})
        }
    });
}

function truncate(s, max) {
    if (typeof s !== 'string') return '';
    return s.length > max ? s.slice(0, max) + '… [truncated]' : s;
}

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') return { valid: false, field: 'body' };
    if (typeof payload.title !== 'string' || !payload.title.trim()) return { valid: false, field: 'title' };
    if (typeof payload.description !== 'string' || !payload.description.trim()) return { valid: false, field: 'description' };
    if (!payload.metadata || typeof payload.metadata !== 'object') return { valid: false, field: 'metadata' };
    return { valid: true };
}

function formatIssueBody(payload) {
    const { description, steps, metadata } = payload;
    const md = metadata || {};
    const recentErrors = Array.isArray(md.recentErrors) ? md.recentErrors : [];

    const lines = [];
    lines.push('## Popis\n');
    lines.push(truncate(description, MAX_DESC));
    lines.push('\n## Kroky k reprodukci\n');
    lines.push(steps && steps.trim() ? truncate(steps, MAX_STEPS) : '_Neuvedeno_');
    lines.push('\n---\n');
    lines.push('### Automatická metadata\n');
    lines.push('| Field | Value |');
    lines.push('|---|---|');
    lines.push(`| **App version** | \`${md.appVersion || 'unknown'}\` |`);
    lines.push(`| **Page** | \`${md.pagePath || 'unknown'}\` |`);
    lines.push(`| **Language** | \`${md.language || 'unknown'}\` |`);
    lines.push(`| **Timestamp** | \`${md.timestamp || 'unknown'}\` |`);
    lines.push(`| **User agent** | \`${md.userAgent || 'unknown'}\` |`);

    if (recentErrors.length > 0) {
        lines.push('\n### Recent console errors\n');
        lines.push('```');
        for (const err of recentErrors) {
            lines.push(String(err));
        }
        lines.push('```');
    }

    lines.push('\n---\n');
    lines.push('*Reportováno přes in-app bug reporter. Kontakt na uživatele zde není — v případě potřeby reagujte komentářem na tuto issue.*');
    return lines.join('\n');
}

async function checkRateLimit(ip, env) {
    if (!env.BUG_REPORT_RATELIMIT) {
        // KV not configured — fail-open in dev
        return { allowed: true, warning: 'KV not bound' };
    }
    const now = Math.floor(Date.now() / 1000);
    const hourBucket = Math.floor(now / HOUR_TTL);
    const dayBucket = Math.floor(now / DAY_TTL);
    const hourKey = `rl:hour:${ip}:${hourBucket}`;
    const dayKey = `rl:day:${ip}:${dayBucket}`;

    const [hourStr, dayStr] = await Promise.all([
        env.BUG_REPORT_RATELIMIT.get(hourKey),
        env.BUG_REPORT_RATELIMIT.get(dayKey)
    ]);
    const hourCount = parseInt(hourStr || '0', 10);
    const dayCount = parseInt(dayStr || '0', 10);

    if (hourCount >= HOUR_LIMIT) {
        return { allowed: false, limit: 'hourly', retryAfter: HOUR_TTL };
    }
    if (dayCount >= DAY_LIMIT) {
        return { allowed: false, limit: 'daily', retryAfter: DAY_TTL };
    }

    await Promise.all([
        env.BUG_REPORT_RATELIMIT.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_TTL }),
        env.BUG_REPORT_RATELIMIT.put(dayKey, String(dayCount + 1), { expirationTtl: DAY_TTL })
    ]);
    return { allowed: true };
}

async function createGithubIssue(payload, env) {
    const lang = (payload.metadata && payload.metadata.language) || 'unknown';
    const body = formatIssueBody(payload);
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/issues`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'BIM-checker-bug-reporter',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `[Bug] ${truncate(payload.title, MAX_TITLE)}`,
            body,
            labels: ['bug-report', 'user-submitted', `lang:${lang}`]
        })
    });
    if (!response.ok) {
        return { ok: false, status: response.status };
    }
    const data = await response.json();
    return { ok: true, issueUrl: data.html_url, issueNumber: data.number };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
        return jsonResponse({ error: 'forbidden_origin' }, 403, origin);
    }

    let payload;
    try {
        payload = await request.json();
    } catch (_e) {
        return jsonResponse({ error: 'invalid_json' }, 400, origin);
    }

    const validation = validatePayload(payload);
    if (!validation.valid) {
        return jsonResponse({ error: 'invalid_input', field: validation.field }, 400, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rl = await checkRateLimit(ip, env);
    if (!rl.allowed) {
        return jsonResponse(
            { error: 'rate_limit', limit: rl.limit },
            429,
            origin,
            { 'Retry-After': String(rl.retryAfter) }
        );
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
        return jsonResponse({ error: 'misconfigured' }, 500, origin);
    }

    const gh = await createGithubIssue(payload, env);
    if (!gh.ok) {
        return jsonResponse({ error: 'github_failed', status: gh.status }, 502, origin);
    }

    return jsonResponse({
        ok: true,
        issueUrl: gh.issueUrl,
        issueNumber: gh.issueNumber
    }, 201, origin);
}
