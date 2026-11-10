import { NextRequest, NextResponse } from 'next/server';

function getTargetBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/+$/, '').replace('localhost', '127.0.0.1');
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '').replace('localhost', '127.0.0.1');
  }
  const apiPort = process.env.API_PORT || '5000';
  return `http://127.0.0.1:${apiPort}/api/v1`;
}

async function handleProxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (params.path || []).join('/');
  const search = req.nextUrl.search;
  const baseUrl = getTargetBaseUrl();
  const targetUrl = `${baseUrl}/${path}${search}`;

  const headers = new Headers();
  req.headers.forEach((val, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, val);
    }
  });

  // Explicitly forward Cookie header if present
  const cookie = req.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.blob() : undefined;

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers();
    res.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        responseHeaders.set(key, val);
      }
    });

    const nextRes = new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });

    // Forward Set-Cookie headers properly so browser receives both access and refresh cookies
    const setCookies = typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : [];

    for (const cookieStr of setCookies) {
      nextRes.headers.append('set-cookie', cookieStr);
    }

    return nextRes;
  } catch (err: any) {
    console.error(`[API Proxy Error] Failed to connect to ${targetUrl}:`, err.message);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PROXY_ERROR',
          message: `Failed to connect to backend API at ${targetUrl}: ${err.message}`,
        },
      },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;
