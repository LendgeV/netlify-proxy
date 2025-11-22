// netlify/edge-functions/proxy-handler.ts
import type { Context } from "@netlify/edge-functions";

// 定义你的代理规则
// 注意：
// 1. 键名会自动作为路径前缀（自动添加 /）
// 2. 值会自动添加 https:// 协议（除非已有协议）
// 3. 访问 /groq/xxx 会代理到 https://api.groq.com/openai/xxx

const PROXY_CONFIG = {
  // ===== API 服务器 =====
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

  // ===== 社交/通讯 API =====
  discord: "discord.com/api",
  telegram: "api.telegram.org",

  // ===== 其他 AI 服务 =====
  cohere: "api.cohere.ai",
  huggingface: "api-inference.huggingface.co",
  together: "api.together.xyz",
  novita: "api.novita.ai",
  portkey: "api.portkey.ai",
  fireworks: "api.fireworks.ai",
  meta: "www.meta.ai/api",

  // ===== 任意网址代理 =====
  hanime: "hanime1.me",
  hexo: "hexo-gally.vercel.app",
  tv: "tv.gally.ddns-ip.net",
} as const;

// 需要修复路径的内容类型
const HTML_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml'
];

// 可能需要修复路径的 CSS 内容类型
const CSS_CONTENT_TYPES = [
  'text/css'
];

// JavaScript 内容类型
const JS_CONTENT_TYPES = [
  'application/javascript',
  'text/javascript',
  'application/x-javascript'
];

// 特定网站的替换规则 (针对某些站点的特殊处理)
const SPECIAL_REPLACEMENTS: Record<string, Array<{pattern: RegExp, replacement: Function}>> = {
  // hexo 博客特殊处理 (Vercel 部署)
  'hexo-gally.vercel.app': [
    // 替换所有 /css/, /js/, /images/ 等资源路径
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
  // TV 站点特殊处理
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
  // 如果已经有协议，直接返回
  if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
    return urlString;
  }
  // 否则添加 https://
  return 'https://' + urlString;
}

/**
 * 标准化路径前缀 - 确保以 / 开头
 */
function normalizePathPrefix(prefix: string): string {
  return prefix.startsWith('/') ? prefix : '/' + prefix;
}

export default async (request: Request, context: Context) => {
  // 处理 CORS 预检请求 (OPTIONS)
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

  // 特殊处理 /proxy/ 路径 - 用于代理任意URL
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

  // 查找匹配的代理配置
  let targetBaseUrl: string | null = null;
  let matchedPrefix: string | null = null;

  // 将配置键转换为标准化的路径前缀
  const normalizedConfig: Record<string, string> = {};
  for (const [key, value] of Object.entries(PROXY_CONFIG)) {
    const normalizedKey = normalizePathPrefix(key);
    const normalizedValue = normalizeUrl(value);
    normalizedConfig[normalizedKey] = normalizedValue;
  }

  // 倒序遍历，以便更具体的路径优先
  const prefixes = Object.keys(normalizedConfig).sort().reverse();

  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      targetBaseUrl = normalizedConfig[prefix];
      matchedPrefix = prefix;
      break;
    }
  }

  // 如果找到了匹配的规则
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
          // 1. 替换以协议开头的绝对路径
          content = content.replace(
            new RegExp(`(href|src|action|content)=["']https?://${targetDomain}(/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          // 2. 替换以 // 开头的协议相对路径
          content = content.replace(
            new RegExp(`(href|src|action|content)=["']//${targetDomain}(/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          // 3. 替换以根目录 / 开头的路径
          content = content.replace(
            new RegExp(`(href|src|action|content)=["'](/[^"']*?)["']`, 'gi'),
            `$1="${url.origin}${matchedPrefix}$2"`
          );
          
          // 4. 替换 CSS 中的 url() 引用
          content = content.replace(
            new RegExp(`url\\(['"]?https?://${targetDomain}(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
          
          // 5. 替换 CSS 中 url(//...) 的引用
          content = content.replace(
            new RegExp(`url\\(['"]?//${targetDomain}(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
          
          // 6. 替换 CSS 中 url(/...) 根目录引用
          content = content.replace(
            new RegExp(`url\\(['"]?(/[^)'"]*?)['"]?\\)`, 'gi'),
            `url(${url.origin}${matchedPrefix}$1)`
          );
          
          // 7. 处理 <base> 标签
          content = content.replace(
            new RegExp(`<base[^>]*href=["']https?://${targetDomain}(?:/[^"']*?)?["'][^>]*>`, 'gi'),
            `<base href="${url.origin}${matchedPrefix}/">`
          );
          
          // 8. 处理相对路径
          content = content.replace(
            /(href|src|action|data-src|data-href)=["']((?!https?:\/\/|\/\/|\/)[^"']+)["']/gi,
            `$1="${url.origin}${matchedPrefix}/${targetPathBase}$2"`
          );
          
          // 9. 处理 JSON 资源路径
          content = content.replace(
            new RegExp(`"(url|path|endpoint|src|href)"\\s*:\\s*"https?://${targetDomain}(/[^"]*?)"`, 'gi'),
            `"$1":"${url.origin}${matchedPrefix}$2"`
          );
          
          // 9.1 处理 JSON 路径中的根路径引用
          content = content.replace(
            /"(url|path|endpoint|src|href)"\s*:\s*"(\/[^"]*?)"/gi,
            `"$1":"${url.origin}${matchedPrefix}$2"`
          );
          
          // 10. 处理内联 JavaScript 中的路径
          content = content.replace(
            new RegExp(`['"]https?://${targetDomain}(/[^"']*?)['"]`, 'gi'),
            `"${url.origin}${matchedPrefix}$1"`
          );
          
          // 11. 处理 JavaScript 中的根路径引用
          content = content.replace(
            /([^a-zA-Z0-9_])(['"])(\/[^\/'"]+\/[^'"]*?)(['"])/g,
            `$1$2${url.origin}${matchedPrefix}$3$4`
          );
          
          // 12. 处理 srcset 属性
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
          
          // 应用特定网站的替换规则
          if (SPECIAL_REPLACEMENTS[targetDomain as keyof typeof SPECIAL_REPLACEMENTS]) {
            const replacements = SPECIAL_REPLACEMENTS[targetDomain as keyof typeof SPECIAL_REPLACEMENTS];
            for (const replacement of replacements) {
              content = content.replace(replacement.pattern, replacement.replacement as any);
            }
          }
          
          // 添加修复脚本
          const prefixWithoutSlash = matchedPrefix.substring(1);
          const fixScript = `
          <script>
          (function() {
            const proxyPrefix = '${matchedPrefix}';
            const proxyPrefixName = '${prefixWithoutSlash}';
            
            // Vercel Next.js 特殊处理
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

            // 通用修复
            const generalObserver = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                      const elements = node.querySelectorAll('script[src], link[href], img[src], a[href], [data-src], [data-href]');
                      elements.forEach(function(el) {
                        ['src', 'href', 'data-src', 'data-href'].forEach(function(attr) {
                          if (el.hasAttribute(attr)) {
                            let val = el.getAttribute(attr);
                            if (val && !val.match(/^(https?:|\/\/|${url.origin})/)) {
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
        
        // CSS 文件处理
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
            /url\(['"]?(?!https?:\/\/|\/\/|\/|data:|#)([^)'"]*)['"]?\)/gi，
            `url(${url.origin}${matchedPrefix}${cssDir}$1)`
          );
        }
        
        // JavaScript 文件处理
        if (JS_CONTENT_TYPES.some(type => contentType.includes(type))) {
          content = content。替换(
            new RegExp(`(['"])https?://${targetDomain}(/[^'"]*?)(['"])`, 'gi'),
            `$1${url。origin}${matchedPrefix}$2$3`
          );
          
          content = content。replace(
            new RegExp(`(['"])//${targetDomain}(/[^'"]*?)(['"])`， 'gi'),
            `$1${url。origin}${matchedPrefix}$2$3`
          );
          
          content = content。replace(
            /(['"])(\/[^'"]*?\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|webm|ogg|woff|woff2|ttf|eot))(['"])/gi，
            `$1${url。origin}${matchedPrefix}$2$3`
          );
        }
        
        newResponse = new Response(content, {
          status: response。status，
          statusText: response。statusText，
          headers: response。headers
        });
      } else {
        newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response。headers
        });
      }
      
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse。headers。set('Access-Control-Allow-Methods'， 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');
      
      newResponse。headers。delete('Content-Security-Policy');
      newResponse.headers.delete('Content-Security-Policy-Report-Only');
      newResponse。headers。delete('X-Frame-Options');
      newResponse.headers.delete('X-Content-Type-Options');
      
      if (HTML_CONTENT_TYPES。some(type => contentType.includes(type))) {
        newResponse。headers。set('Cache-Control'， 'no-store, no-cache, must-revalidate, proxy-revalidate');
        newResponse。headers。set('Pragma'， 'no-cache');
        newResponse.headers.set('Expires', '0');
      } else {
        newResponse.headers.set('Cache-Control', 'public, max-age=86400');
      }
      
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
          const location = response.headers.get('location')!;
          const redirectedUrl = new URL(location, targetUrl);

          if (redirectedUrl。origin === targetUrl。origin) {
              const newLocation = url。origin + matchedPrefix + redirectedUrl。pathname + redirectedUrl.search;
              context.log(`Rewriting redirect from ${location} to ${newLocation}`);
              newResponse.headers.set('Location', newLocation);
          } else {
              context.log(`Proxying redirect to external location: ${location}`);
          }
      }
      
      return newResponse;

    } catch (error) {
      context.log("Error fetching target URL:", error);
      return new Response("代理请求失败", { 
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }

  // 如果没有匹配的代理规则，则不处理此请求，交由 Netlify 的其他规则处理
  return;
};
