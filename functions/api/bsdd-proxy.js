/**
 * Cloudflare Pages Function — bSDD API CORS proxy
 *
 * Proxies requests to the production bSDD API (api.bsdd.buildingsmart.org)
 * which does not send CORS headers for unregistered domains.
 *
 * Usage: /api/bsdd-proxy?url=https://api.bsdd.buildingsmart.org/api/Dictionary/v1
 *
 * Only proxies requests to api.bsdd.buildingsmart.org (not an open proxy).
 */

const ALLOWED_ORIGIN = 'https://api.bsdd.buildingsmart.org';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
};

export async function onRequest(context) {
    const { request } = context;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only allow GET
    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const requestUrl = new URL(request.url);
    const targetUrl = requestUrl.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing "url" parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
    }

    // Security: only proxy to bSDD production API
    if (!targetUrl.startsWith(ALLOWED_ORIGIN)) {
        return new Response(JSON.stringify({ error: 'Only bSDD API requests are allowed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
    }

    try {
        const apiResponse = await fetch(targetUrl, {
            headers: {
                'Accept': 'application/json',
                'X-User-Agent': 'BIMChecker/1.0',
            },
        });

        const body = await apiResponse.text();

        return new Response(body, {
            status: apiResponse.status,
            headers: {
                'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
                'Cache-Control': 'public, max-age=300',
                ...CORS_HEADERS,
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Proxy fetch failed' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
    }
}
