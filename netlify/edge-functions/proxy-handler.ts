// netlify/edge-functions/proxy-handler.ts
import type { Context } from "@netlify/edge-functions";

// 定义你的代理规则
const PROXY_CONFIG = {
  // ===== API =====
  groq: "api.groq.com/openai",
  groq_g4f: "g4f.dev/api/groq",
  openrouter: "openrouter.ai/api",
  cerebras: "api.cerebras.ai",
  openai: "api.openai.com",
  claude: "api.anthropic.com",
  gemini: "generativelanguage.googleapis.com",
  gemininothink: "generativelanguage.googleapis.com",
  gemini_g4f: "g4f.dev/api/gemini",
  xai: "api.x.ai",
  xai_linux: "img001.eu.org",
  vercel: "ai-gateway.vercel.sh",
  anannas: "api.anannas.ai",
  bonsai: "go.trybons.ai",
  oxen: "hub.oxen.ai",
  zenmux: "zenmux.ai/api",
  deepinfra: "api.deepinfra.com",
  nvidia: "integrate.api.nvidia.com",
  nvidia_g4f: "g4f.dev/api/nvidia",
  verse8: "agent8.verse8.io",
  megallm: "ai.megallm.io",
  vapi: "v-api.zeabur.app",
  free: "v-api.zeabur.app",
  claude_docs: "api.inkeep.com",
  claude_docs_challenge: "api.inkeep.com",
  puter: "api.puter.com",
  gpt4free: "gpt4free.pro",
  pollinations: "text.pollinations.ai/openai",
  storytell: "api.storytell.ai",
  metir: "metir-chat.fly.dev",
  b4u: "b4u.qzz.io",
  glm_linux: "newapi.ixio.cc",
  weights: "api.inference.wandb.ai",
  electronhub: "api.electronhub.ai",
  mnn: "api.mnnai.ru",
  navy: "api.navy",
  void: "api.voidai.app",

  // ===== 网站 =====
  hanime: "hanime1.me",
} as const;

// 需要修复路径的内容类型
const HTML_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml'
];

const CSS_CONTENT_TYPES = [
  'text/css'
];

const JS_CONTENT_TYPES = [
  'application/javascript',
  'text/javascript',
  'application/x-javascript'
];

// 特定网站的替换规则
const SPECIAL_REPLACEMENTS: Record<string, Array<{pattern: RegExp, replacement: Function}>> = {
  'hexo-gally.vercel.app': [
    {
      pattern: /(?:src|href|content)=['"](?:\.?\/)?([^"']*\.(css|js|png|jpg|jpeg|gif|svg|webp|ico))["']/gi,
      replacement: (match: string, path: string, ext: string) => {
        if (path.startsWith('http')) return match;
        if (path.startsWith('/')) {
          return match.replace(`"/${path.slice(1)}`, `"/hexo/${path.slice(1)}`);
        }
        return match.replace(`"${path}`, `"/hexo/${path}`);
      }
    },
    {
      pattern: /url\(['"]?(?:\.?\/)?([^'")]*\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot))['"]?\)/gi,
      replacement: (match: string, path: string) => {
        if (path.startsWith('http')) return match;
        if (path.startsWith('/')) {
          return match.replace(`(/${path.slice(1)}`, `(/hexo/${path.slice(1)}`);
        }
        return match.replace(`(${path}`, `(/hexo/${path}`);
      }
    },
    {
      pattern: /(src|href)=["']((?:\/_next\/)[^"']*)["']/gi,
      replacement: (match: string, attr: string, path: string) => {
        return `${attr}="/hexo${path}"`;
      }
    },
    {
      pattern: /"(\/_next\/static\/chunks\/[^"]+)"/gi,
      replacement: (match: string, path: string) => {
        return `"/hexo${path}"`;
      }
    },
    {
      pattern: /"(\/api\/[^"]+)"/gi,
      replacement: (match: string, path: string) => {
        return `"/hexo${path}"`;
      }
    },
    {
      pattern: /data-href=["']((?:\/_next\/)[^"']*)["']/gi,
      replacement: (match: string, path: string) => {
        return `data-href="/hexo${path}"`;
      }
    }
  ],
  'tv.gally.ddns-ip.net': [
    {
      pattern: /(?:src|href|content)=['"](?:\.?\/)?([^"']*\.(css|js|png|jpg|jpeg|gif|svg|webp|ico))["']/gi,
      replacement: (match: string, path: string, ext: string) => {
        if (path.startsWith('http')) return match;
        if (path.startsWith('/')) {
          return match.replace(`"/${path.slice(1)}`, `"/tv/${path.slice(1)}`);
        }
        return match.replace(`"${path}`, `"/tv/${path}`);
      }
    },
    {
      pattern: /url\(['"]?(?:\.?\/)?([^'")]*\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot))['"]?\)/gi,
      replacement: (match: string, path: string) => {
        if (path.startsWith('http')) return match;
        if (path.startsWith('/')) {
          return match.replace(`(/${path.slice(1)}`, `(/tv/${path.slice(1)}`);
        }
        return match.replace(`(${path}`, `(/tv/${path}`);
      }
    }
  ]
};

/**
 * 标准化URL - 确保有协议前缀
 */
function normalizeUrl(urlString: string): string {
  if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
    return urlString;
  }
  return 'https://' + urlString;
}

/**
 * 标准化路径前缀 - 确保以 / 开头
 */
function normalizePathPrefix(prefix: string): string {
  return prefix.startsWith('/') ? prefix : '/' + prefix;
}

/**
 * 获取目标域名的 Referer
 */
function getTargetReferer(targetUrl: URL): string {
  const host = targetUrl.host;
  
  // 特殊处理某些视频CDN
  if (host.includes('hembed.com') || host.includes('vdownload')) {
    return 'https://hanime1.me/';
  }
  
  return `${targetUrl.protocol}//${targetUrl.host}/`;
}

export default async (request: Request, context: Context) => {
  // 处理 CORS 预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, Range",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 特殊处理 /proxy/ 路径
  if (path.startsWith('/proxy/')) {
    try {
      let targetUrlString = path.substring('/proxy/'.length);
      
      if (targetUrlString.startsWith('http%3A%2F%2F') || targetUrlString.startsWith('https%3A%2F%2F')) {
        targetUrlString = decodeURIComponent(targetUrlString);
      }
      
      targetUrlString = normalizeUrl(targetUrlString);
      const targetUrl = new URL(targetUrlString);
      
      if (url.search && !targetUrlString.includes('?')) {
        targetUrl.search = url.search;
      }
      
      context.log(`Proxying generic request to: ${targetUrl.toString()}`);
      
      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: new Headers(), // ✅ 创建新的 headers 对象
        body: request.body,
        redirect: 'manual',
      });
      
      // ✅ 关键修复：设置正确的请求头，伪装成来自目标网站
      proxyRequest.headers.set("Host", targetUrl.host);
      proxyRequest.headers.set("User-Agent", request.headers.get("User-Agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
      
      // ✅ 设置正确的 Referer 和 Origin
      const targetReferer = getTargetReferer(targetUrl);
      proxyRequest.headers.set('Referer', targetReferer);
      proxyRequest.headers.set('Origin', targetUrl.origin);
      
      const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
      proxyRequest.headers.set('X-Forwarded-For', clientIp);
      proxyRequest.headers.set('X-Forwarded-Host', url.host);
      proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      
      // ✅ 复制 Range 头（视频断点续传需要）
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        proxyRequest.headers.set('Range', rangeHeader);
        context.log(`Range request: ${rangeHeader}`);
      }
      
      // 从原始请求复制必要的头
      const headersToKeep = ['Accept', 'Accept-Language', 'Cache-Control'];
      headersToKeep.forEach(header => {
        const value = request.headers.get(header);
        if (value) {
          proxyRequest.headers.set(header, value);
        }
      });
      
      // ✅ 不要设置 accept-encoding，让 CDN 直接返回未压缩内容
      proxyRequest.headers.delete('accept-encoding');
      
      const response = await fetch(proxyRequest);
      
      context.log(`Response status: ${response.status} for ${targetUrl.toString()}`);
      
      // ✅ 克隆响应并修改头
      let newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
      newResponse.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      
      newResponse.headers.delete('Content-Security-Policy');
      newResponse.headers.delete('Content-Security-Policy-Report-Only');
      newResponse.headers.delete('X-Frame-Options');
      newResponse.headers.delete('X-Content-Type-Options');
      
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        const location = response.headers.get('location')!;
        const redirectedUrl = new URL(location, targetUrl);
        const newLocation = `${url.origin}/proxy/${encodeURIComponent(redirectedUrl.toString())}`;
        newResponse.headers.set('Location', newLocation);
      }
      
      return newResponse;
    } catch (error) {
      context.log(`Error proxying generic URL: ${error}`);
      return new Response(`代理请求失败: ${error}`, { 
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }

  // 查找匹配的代理配置
  let targetBaseUrl: string | null = null;
  let matchedPrefix: string | null = null;

  const normalizedConfig: Record<string, string> = {};
  for (const [key, value] of Object.entries(PROXY_CONFIG)) {
    const normalizedKey = normalizePathPrefix(key);
    const normalizedValue = normalizeUrl(value);
    normalizedConfig[normalizedKey] = normalizedValue;
  }

  const prefixes = Object.keys(normalizedConfig).sort().reverse();

  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      targetBaseUrl = normalizedConfig[prefix];
      matchedPrefix = prefix;
      break;
    }
  }

  if (targetBaseUrl && matchedPrefix) {
    const remainingPath = path.substring(matchedPrefix.length);
    const targetUrlString = targetBaseUrl.replace(/\/$/, '') + remainingPath;
    const targetUrl = new URL(targetUrlString);

    targetUrl.search = url.search;

    context.log(`Proxying "${path}" to "${targetUrl.toString()}"`);

    try {
      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: new Headers(), // ✅ 创建新的 headers 对象
        body: request.body,
        redirect: 'manual',
      });

      // ✅ 设置正确的请求头
      proxyRequest.headers.set("Host", targetUrl.host);
      proxyRequest.headers.set("User-Agent", request.headers.get("User-Agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
      
      // ✅ 设置正确的 Referer 和 Origin
      const targetReferer = getTargetReferer(targetUrl);
      proxyRequest.headers.set('Referer', targetReferer);
      proxyRequest.headers.set('Origin', targetUrl.origin);
      
      const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
      proxyRequest.headers.set('X-Forwarded-For', clientIp);
      proxyRequest.headers.set('X-Forwarded-Host', url.host);
      proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      
      // ✅ 处理 Range 请求
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        proxyRequest.headers.set('Range', rangeHeader);
        context.log(`Range request: ${rangeHeader}`);
      }
      
      // 从原始请求复制必要的头
      const headersToKeep = ['Accept', 'Accept-Language', 'Cache-Control'];
      headersToKeep.forEach(header => {
        const value = request.headers.get(header);
        if (value) {
          proxyRequest.headers.set(header, value);
        }
      });
      
      proxyRequest.headers.delete('accept-encoding');
      
      const response = await fetch(proxyRequest);
      
      context.log(`Response status: ${response.status} for ${targetUrl.toString()}`);
      
      const contentType = response.headers.get('content-type') || '';
      
      const isM3U8 = contentType.includes('application/vnd.apple.mpegurl') || 
                     contentType.includes('application/x-mpegURL') ||
                     targetUrl.pathname.endsWith('.m3u8');
      
      let newResponse: Response;
      
      const needsRewrite = HTML_CONTENT_TYPES.some(type => contentType.includes(type)) || 
                           CSS_CONTENT_TYPES.some(type => contentType.includes(type)) ||
                           JS_CONTENT_TYPES.some(type => contentType.includes(type)) ||
                           isM3U8;
                           
      if (needsRewrite) {
        const clonedResponse = response.clone();
        let content = await clonedResponse.text();
        
        const targetDomain = targetUrl.host;
        const targetOrigin = targetUrl.origin;
        const targetPathBase = targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf('/') + 1);
        
        if (HTML_CONTENT_TYPES.some(type => contentType.includes(type))) {
          // ... (保持原有 HTML 处理代码)
          content = content.replace(
            new RegExp(`(href|src|action|content)=["']https?://${targetDomain}(/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          content = content.replace(
            new RegExp(`(href|src|action|content)=["']//${targetDomain}(/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          content = content.replace(
            new RegExp(`(href|src|action|content)=["'](/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          // ... (其他HTML处理保持不变)
        }
        
        if (CSS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          // ... (保持原有 CSS 处理代码)
          content = content.replace(
            new RegExp(`url\\(['"]?https?://${targetDomain}(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
          
          content = content.replace(
            new RegExp(`url\\(['"]?//${targetDomain}(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
          
          content = content.replace(
            new RegExp(`url\\(['"]?(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
        }
        
        if (JS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          // ... (保持原有 JS 处理代码)
          content = content.replace(
            new RegExp(`(['"])https?://${targetDomain}(/[^'"]*?)(['"])`, 'gi'),
            `$1${url.origin}${matchedPrefix}$2$3`
          );
        }
        
        if (isM3U8) {
          context.log('Processing M3U8 file');
          content = content.split('\n').map(line => {
            line = line.trim();
            
            if (line.startsWith('#') || !line) {
              return line;
            }
            
            if (line.startsWith('http://') || line.startsWith('https://')) {
              if (line.includes(targetUrl.host)) {
                const urlObj = new URL(line);
                return `${url.origin}${matchedPrefix}${urlObj.pathname}${urlObj.search}`;
              }
              return line;
            } else if (line.startsWith('//')) {
              const urlObj = new URL('https:' + line);
              if (urlObj.host === targetUrl.host) {
                return `${url.origin}${matchedPrefix}${urlObj.pathname}${urlObj.search}`;
              }
              return line;
            } else if (line.startsWith('/')) {
              return `${url.origin}${matchedPrefix}${line}`;
            } else {
              const m3u8Dir = targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf('/') + 1);
              return `${url.origin}${matchedPrefix}${m3u8Dir}${line}`;
            }
          }).join('\n');
          
          context.log('M3U8 content rewritten');
        }
        
        newResponse = new Response(content, {
          status: response.status,
          statusText: response。statusText，
          headers: response。headers
        });
      } else {
        newResponse = new Response(response.body, {
          status: response。status，
          statusText: response。statusText，
          headers: response。headers
        });
      }
      
      newResponse。headers。set('Access-Control-Allow-Origin'， '*');
      newResponse。headers。set('Access-Control-Allow-Methods'， 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse。headers。set('Access-Control-Allow-Headers'， 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
      newResponse。headers。set('Access-Control-Expose-Headers'， 'Content-Length, Content-Range');
      
      newResponse。headers。delete('Content-Security-Policy');
      newResponse。headers。delete('Content-Security-Policy-Report-Only');
      newResponse。headers。delete('X-Frame-Options');
      newResponse。headers。delete('X-Content-Type-Options');
      
      // ✅ 视频文件使用长缓存
      if (contentType。includes('video/') || contentType.includes('application/octet-stream')) {
        newResponse。headers。set('Cache-Control'， 'public, max-age=31536000');
      } else if (HTML_CONTENT_TYPES.some(type => contentType.includes(type))) {
        newResponse。headers。set('Cache-Control'， 'no-store, no-cache, must-revalidate, proxy-revalidate');
        newResponse。headers。set('Pragma'， 'no-cache');
        newResponse。headers。set('Expires'， '0');
      } else {
        newResponse。headers。set('Cache-Control'， 'public, max-age=86400');
      }
      
      if (response。status >= 300 && response。status < 400 && response。headers。has('location')) {
          const location = response.headers.get('location')!;
          const redirectedUrl = new URL(location, targetUrl);

          if (redirectedUrl。origin === targetUrl。origin) {
              const newLocation = url.origin + matchedPrefix + redirectedUrl.pathname + redirectedUrl.search;
              context。log(`Rewriting redirect from ${location} to ${newLocation}`);
              newResponse。headers。set('Location'， newLocation);
          } else {
              context。log(`Proxying redirect to external location: ${location}`);
          }
      }
      
      return newResponse;

    } catch (error) {
      context。log("Error fetching target URL:"， error);
      return new Response("代理请求失败", { 
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }

  return;
};
