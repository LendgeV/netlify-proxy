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

// 视频/音频/流媒体类型（不需要重写内容）
const MEDIA_CONTENT_TYPES = [
  'video/',
  'audio/',
  'application/octet-stream',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml'
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
 * 检查路径是否是直接代理URL（http:// 或 https:// 开头）
 */
function isDirectProxyUrl(path: string): boolean {
  return path.startsWith('/http://') || path.startsWith('/https://');
}

/**
 * 处理直接代理请求
 */
async function handleDirectProxy(request: Request, context: Context, url: URL) {
  try {
    // 移除开头的 /
    let targetUrlString = url.pathname.substring(1);
    
    // 如果URL被编码了,解码它
    if (targetUrlString.includes('%')) {
      targetUrlString = decodeURIComponent(targetUrlString);
    }
    
    // 添加查询参数
    if (url.search) {
      targetUrlString += url.search;
    }
    
    const targetUrl = new URL(targetUrlString);
    
    context.log(`Direct proxy request to: ${targetUrl.toString()}`);
    
    // 创建代理请求,保留所有原始头部
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set("Host", targetUrl.host);
    proxyHeaders.set("Origin", targetUrl.origin);
    
    // 保留 Range 头部（视频流必需）
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      proxyHeaders.set('Range', rangeHeader);
    }
    
    const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
    proxyHeaders.set('X-Forwarded-For', clientIp);
    proxyHeaders.set('X-Forwarded-Host', url.host);
    proxyHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    
    // 🔧 不要删除 accept-encoding,这对视频流很重要
    // proxyHeaders.delete('accept-encoding');
    
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        if (refUrl.pathname.startsWith('/http')) {
          const originalReferer = refUrl.pathname.substring(1);
          proxyHeaders.set('referer', originalReferer);
        }
      } catch(e) {
        // 保持原样
      }
    }
    
    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: request.body,
      redirect: 'follow', // 🔧 改为 follow,自动跟随重定向
    });
    
    const response = await fetch(proxyRequest);
    
    const contentType = response.headers.get('content-type') || '';
    
    // 🔧 检查是否是媒体文件
    const isMedia = MEDIA_CONTENT_TYPES.some(type => contentType.includes(type));
    
    let newResponse: Response;
    
    if (isMedia) {
      // 🔧 媒体文件直接透传,不修改内容
      newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      // 保留 Content-Range 和 Accept-Ranges 头部
      if (response.headers.has('content-range')) {
        newResponse.headers.set('Content-Range', response.headers.get('content-range')!);
      }
      if (response.headers.has('accept-ranges')) {
        newResponse.headers.set('Accept-Ranges', response.headers.get('accept-ranges')!);
      }
      
      context.log(`Streaming media file: ${contentType}, Range: ${rangeHeader || 'none'}`);
    } else {
      // 对 HTML/CSS/JS 进行重写
      const needsRewrite = HTML_CONTENT_TYPES.some(type => contentType.includes(type)) || 
                           CSS_CONTENT_TYPES.some(type => contentType.includes(type)) ||
                           JS_CONTENT_TYPES.some(type => contentType.includes(type));
      
      if (needsRewrite) {
        let content = await response.text();
        
        const targetDomain = targetUrl.host;
        const targetOrigin = targetUrl.origin;
        
        // 重写 HTML 中的链接
        if (HTML_CONTENT_TYPES.some(type => contentType.includes(type))) {
          // 重写绝对URL
          content = content.replace(
            new RegExp(`(href|src|action|content|data-src|data-href)=["'](https?://${targetDomain}[^"']*)["']`, 'gi'),
            `$1="${url.origin}/$2"`
          );
          
          // 重写协议相对URL
          content = content.replace(
            new RegExp(`(href|src|action|content|data-src|data-href)=["'](//${targetDomain}[^"']*)["']`, 'gi'),
            `$1="${url.origin}/https:$2"`
          );
          
          // 重写根相对URL
          content = content.replace(
            /(href|src|action|content|data-src|data-href)=["'](\/[^"']*?)["']/gi,
            `$1="${url.origin}${targetOrigin}$2"`
          );
          
          // 重写 CSS 中的 url()
          content = content.replace(
            /url\(['"]?(\/[^)'"]*)['"]?\)/gi,
            `url(${url.origin}${targetOrigin}$1)`
          );
          
          // 🔧 添加视频支持脚本
          const proxyScript = `
          <script>
          (function() {
            const originalFetch = window.fetch;
            window.fetch = function(resource, init) {
              if (typeof resource === 'string') {
                // 如果是完整URL,添加代理前缀
                if (resource.match(/^https?:\\/\\//)) {
                  if (!resource.startsWith('${url.origin}')) {
                    resource = '${url.origin}/' + resource;
                  }
                }
                // 如果是相对路径,转换为绝对路径后添加代理前缀
                else if (resource.startsWith('/')) {
                  resource = '${url.origin}${targetOrigin}' + resource;
                }
              }
              return originalFetch.call(this, resource, init);
            };
            
            // 拦截 XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              if (typeof url === 'string') {
                if (url.match(/^https?:\\/\\//)) {
                  if (!url.startsWith('${url.origin}')) {
                    url = '${url.origin}/' + url;
                  }
                } else if (url.startsWith('/')) {
                  url = '${url.origin}${targetOrigin}' + url;
                }
              }
              return originalOpen.call(this, method, url, ...rest);
            };
            
            // 监听动态添加的媒体元素
            const observer = new MutationObserver(function(mutations) {
              document.querySelectorAll('video, audio, source, img').forEach(function(el) {
                ['src', 'data-src'].forEach(function(attr) {
                  if (el.hasAttribute(attr)) {
                    let val = el.getAttribute(attr);
                    if (val && !val.startsWith('${url.origin}') && !val.startsWith('data:') && !val.startsWith('blob:')) {
                      if (val.match(/^https?:\\/\\//)) {
                        el.setAttribute(attr, '${url.origin}/' + val);
                      } else if (val.startsWith('/')) {
                        el.setAttribute(attr, '${url.origin}${targetOrigin}' + val);
                      }
                    }
                  }
                });
              });
            });
            
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
          })();
          </script>
          `;
          
          const bodyCloseTagPos = content.lastIndexOf('</body>');
          if (bodyCloseTagPos !== -1) {
            content = content.substring(0, bodyCloseTagPos) + proxyScript + content.substring(bodyCloseTagPos);
          } else {
            content += proxyScript;
          }
        }
        
        // 重写 CSS
        if (CSS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          content = content.replace(
            /url\(['"]?(\/[^)'"]*)['"]?\)/gi,
            `url(${url.origin}${targetOrigin}$1)`
          );
        }
        
        // 重写 JS
        if (JS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          content = content.replace(
            /(['"])(\/[^'"]*?\.(js|css|png|jpg|jpeg|gif|svg|webp|mp4|webm|m3u8|mp3))(['"])/gi,
            `$1${url.origin}${targetOrigin}$2$3`
          );
        }
        
        newResponse = new Response(content, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } else {
        newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
    }
    
    // 设置 CORS 头部
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
    newResponse.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    // 删除可能导致问题的安全头部
    newResponse.headers.delete('Content-Security-Policy');
    newResponse.headers.delete('Content-Security-Policy-Report-Only');
    newResponse.headers.delete('X-Frame-Options');
    
    // 🔧 媒体文件使用更长的缓存时间
    if (isMedia) {
      newResponse.headers.set('Cache-Control', 'public, max-age=31536000');
    } else if (HTML_CONTENT_TYPES.some(type => contentType.includes(type))) {
      newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      newResponse.headers.set('Cache-Control', 'public, max-age=86400');
    }
    
    return newResponse;
  } catch (error) {
    context.log(`Error in direct proxy: ${error}`);
    return new Response(`代理请求失败: ${error}`, { 
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain;charset=UTF-8'
      }
    });
  }
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

  // 🔧 优先检查直接代理URL（如 /https://www.bilibili.com）
  if (isDirectProxyUrl(path)) {
    return handleDirectProxy(request, context, url);
  }

  // 特殊处理 /proxy/ 路径（保留原有功能）
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
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
      });
      
      proxyRequest.headers.set("Host", targetUrl.host);
      
      const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
      proxyRequest.headers.set('X-Forwarded-For', clientIp);
      proxyRequest.headers.set('X-Forwarded-Host', url.host);
      proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refUrl = new URL(referer);
          const newReferer = `${targetUrl.protocol}//${targetUrl.host}${refUrl.pathname}${refUrl.search}`;
          proxyRequest.headers.set('referer', newReferer);
        } catch(e) {
          // 保持原样
        }
      } else {
        proxyRequest.headers.set('referer', `${targetUrl.protocol}//${targetUrl.host}/`);
      }
      
      const response = await fetch(proxyRequest);
      
      let newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
      
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

  // 查找匹配的代理配置（原有功能）
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
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
      });

      proxyRequest.headers.set("Host", targetUrl.host);
      
      const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
      proxyRequest.headers.set('X-Forwarded-For', clientIp);
      proxyRequest.headers.set('X-Forwarded-Host', url.host);
      proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      
      proxyRequest.headers.delete('accept-encoding');
      
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refUrl = new URL(referer);
          const newReferer = `${targetUrl.protocol}//${targetUrl.host}${refUrl.pathname}${refUrl.search}`;
          proxyRequest.headers.set('referer', newReferer);
        } catch(e) {
          // 保持原样
        }
      } else {
        proxyRequest.headers.set('referer', `${targetUrl.protocol}//${targetUrl.host}/`);
      }
      
      const response = await fetch(proxyRequest);
      
      const contentType = response.headers.get('content-type') || '';
      
      let newResponse: Response;
      
      const needsRewrite = HTML_CONTENT_TYPES.some(type => contentType.includes(type)) || 
                           CSS_CONTENT_TYPES.some(type => contentType.includes(type)) ||
                           JS_CONTENT_TYPES.some(type => contentType.includes(type));
                           
      if (needsRewrite) {
        const clonedResponse = response.clone();
        let content = await clonedResponse.text();
        
        const targetDomain = targetUrl.host;
        const targetOrigin = targetUrl.origin;
        const targetPathBase = targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf('/') + 1);
        
        if (HTML_CONTENT_TYPES.some(type => contentType.includes(type))) {
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
          
          content = content.replace(
            new RegExp(`<base[^>]*href=["']https?://${targetDomain}(?:/[^"']*?)?["'][^>]*>`, 'gi'),
            `<base href="${url.origin}${matchedPrefix}/">`
          );
          
          content = content.replace(
            /(href|src|action|data-src|data-href)=["']((?!https?:\/\/|\/\/|\/)[^"']+)["']/gi,
            `$1="${url.origin}${matchedPrefix}/${targetPathBase}$2"`
          );
          
          content = content.replace(
            new RegExp(`"(url|path|endpoint|src|href)"\\s*:\\s*"https?://${targetDomain}(/[^"]*?)"`, 'gi'),
            `"$1":"${url.origin}${matchedPrefix}$2"`
          );
          
          content = content.replace(
            /"(url|path|endpoint|src|href)"\s*:\s*"(\/[^"]*?)"/gi,
            `"$1":"${url.origin}${matchedPrefix}$2"`
          );
          
          content = content.replace(
            new RegExp(`['"]https?://${targetDomain}(/[^"']*?)['"]`, 'gi'),
            `"${url.origin}${matchedPrefix}$1"`
          );
          
          content = content.replace(
            /([^a-zA-Z0-9_])(['"])(\/[^\/'"]+\/[^'"]*?)(['"])/g,
            `$1$2${url.origin}${matchedPrefix}$3$4`
          );
          
          content = content.replace(
            /srcset=["']([^"']+)["']/gi,
            (match, srcset) => {
              const newSrcset = srcset.split(',').map((src: string) => {
                const [srcUrl, descriptor] = src.trim().split(/\s+/);
                let newUrl = srcUrl;
                
                if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
                  if (srcUrl.includes(targetDomain)) {
                    newUrl = srcUrl.replace(
                      new RegExp(`https?://${targetDomain}(/[^\\s]*)`, 'i'),
                      `${url.origin}${matchedPrefix}$1`
                    );
                  }
                } else if (srcUrl.startsWith('//')) {
                  if (srcUrl.includes(targetDomain)) {
                    newUrl = srcUrl.replace(
                      
                      new RegExp(`//${targetDomain}(/[^\\s]*)`, 'i'),
                      `${url.origin}${matchedPrefix}$1`
                    );
                  }
                } else if (srcUrl.startsWith('/')) {
                  newUrl = `${url.origin}${matchedPrefix}${srcUrl}`;
                }
                
                return descriptor ? `${newUrl} ${descriptor}` : newUrl;
              }).join(', ');
              
              return `srcset="${newSrcset}"`;
            }
          );
          
          if (SPECIAL_REPLACEMENTS[targetDomain as keyof typeof SPECIAL_REPLACEMENTS]) {
            const replacements = SPECIAL_REPLACEMENTS[targetDomain as keyof typeof SPECIAL_REPLACEMENTS];
            for (const replacement of replacements) {
              content = content.replace(replacement.pattern, replacement.replacement as any);
            }
          }
          
          const prefixWithoutSlash = matchedPrefix.substring(1);
          const fixScript = `
          <script>
          (function() {
            const proxyPrefix = '${matchedPrefix}';
            const proxyPrefixName = '${prefixWithoutSlash}';
            
            if (window.location.pathname.startsWith(proxyPrefix)) {
              const originalFetch = window.fetch;
              window.fetch = function(resource, init) {
                if (typeof resource === 'string') {
                  if (resource.includes('/_next/data/') && !resource.startsWith(proxyPrefix)) {
                    resource = proxyPrefix + resource;
                  }
                  if (resource.startsWith('/api/') && !resource.startsWith(proxyPrefix)) {
                    resource = proxyPrefix + resource;
                  }
                }
                return originalFetch.call(this, resource, init);
              };

              const observer = new MutationObserver(function(mutations) {
                document.querySelectorAll('script[src^="/_next/"]').forEach(function(el) {
                  const src = el.getAttribute('src');
                  if (src && !src.startsWith(proxyPrefix)) {
                    el.setAttribute('src', proxyPrefix + src);
                  }
                });
                
                document.querySelectorAll('link[rel="preload"][href^="/_next/"]').forEach(function(el) {
                  const href = el.getAttribute('href');
                  if (href && !href.startsWith(proxyPrefix)) {
                    el.setAttribute('href', proxyPrefix + href);
                  }
                });
              });

              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                  observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                  });
                });
              } else {
                observer.observe(document.documentElement, {
                  childList: true,
                  subtree: true
                });
              }
            }

            const generalObserver = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                      const elements = node.querySelectorAll('script[src], link[href], img[src], a[href], video[src], audio[src], source[src], [data-src], [data-href]');
                      elements.forEach(function(el) {
                        ['src', 'href', 'data-src', 'data-href'].forEach(function(attr) {
                          if (el.hasAttribute(attr)) {
                            let val = el.getAttribute(attr);
                            if (val && !val.match(/^(https?:|\/\/|${url.origin}|data:|blob:)/)) {
                              if (val.startsWith('/')) {
                                if (window.location.pathname.startsWith(proxyPrefix) && val.startsWith('/_next/') && !val.startsWith(proxyPrefix)) {
                                  el.setAttribute(attr, proxyPrefix + val);
                                } else {
                                  el.setAttribute(attr, '${url.origin}${matchedPrefix}' + val);
                                }
                              }
                            }
                          }
                        });
                      });
                      
                      const elementsWithStyle = node.querySelectorAll('[style*="url("]');
                      elementsWithStyle.forEach(function(el) {
                        let style = el.getAttribute('style');
                        if (style) {
                          style = style.replace(/url\\(['"]?(\\/[^)'"]*?)['"]?\\)/gi, 
                                               'url(${url.origin}${matchedPrefix}$1)');
                          el.setAttribute('style', style);
                        }
                      });
                    }
                  });
                }
              });
            });
            
            generalObserver.observe(document.body, {
              childList: true,
              subtree: true
            });
          })();
          </script>
          `;
          
          const bodyCloseTagPos = content.lastIndexOf('</body>');
          if (bodyCloseTagPos !== -1) {
            content = content.substring(0, bodyCloseTagPos) + fixScript + content.substring(bodyCloseTagPos);
          } else {
            content += fixScript;
          }
        }
        
        if (CSS_CONTENT_TYPES.some(type => contentType.includes(type))) {
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
          
          const cssPath = targetUrl.pathname;
          const cssDir = cssPath.substring(0, cssPath.lastIndexOf('/') + 1);
          
          content = content.replace(
            /url\(['"]?(?!https?:\/\/|\/\/|\/|data:|#)([^)'"]*)['"]?\)/gi,
            `url(${url.origin}${matchedPrefix}${cssDir}$1)`
          );
        }
        
        if (JS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          content = content.replace(
            new RegExp(`(['"])https?://${targetDomain}(/[^'"]*?)(['"])`, 'gi'),
            `$1${url.origin}${matchedPrefix}$2$3`
          );
          
          content = content.replace(
            new RegExp(`(['"])//${targetDomain}(/[^'"]*?)(['"])`, 'gi'),
            `$1${url.origin}${matchedPrefix}$2$3`
          );
          
          content = content.replace(
            /(['"])(\/[^'"]*?\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|webm|ogg|woff|woff2|ttf|eot))(['"])/gi,
            `$1${url。origin}${matchedPrefix}$2$3`
          );
        }
        
        newResponse = new Response(content, {
          status: response。status,
          statusText: response。statusText,
          headers: response。headers
        });
      } else {
        newResponse = new Response(response.body, {
          status: response。status,
          statusText: response。statusText,
          headers: response。headers
        });
      }
      
      newResponse。headers。set('Access-Control-Allow-Origin', '*');
      newResponse。headers。set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse。headers。set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
      
      newResponse。headers。delete('Content-Security-Policy');
      newResponse。headers。delete('Content-Security-Policy-Report-Only');
      newResponse。headers。delete('X-Frame-Options');
      newResponse。headers。delete('X-Content-Type-Options');
      
      if (HTML_CONTENT_TYPES。some(type => contentType.includes(输入))) {
        newResponse。headers。set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        newResponse。headers。set('Pragma', 'no-cache');
        newResponse。headers。set('Expires', '0');
      } else {
        newResponse。headers。set('Cache-Control', 'public, max-age=86400');
      }
      
      if (response。status >= 300 && response.status < 400 && response.headers.has('location')) {
          const location = response.headers.get('location')!;
          const redirectedUrl = new URL(location, targetUrl);

          if (redirectedUrl。origin === targetUrl.origin) {
              const newLocation = url.origin + matchedPrefix + redirectedUrl.pathname + redirectedUrl.search;
              context。log(`Rewriting redirect from ${location} to ${newLocation}`);
              newResponse。headers。set('Location', newLocation);
          } else {
              context.log(`Proxying redirect to external location: ${location}`);
          }
      }
      
      return newResponse;

    } catch (error) {
      context。log("Error fetching target URL:", error);
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
