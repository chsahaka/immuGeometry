/**
 * Welcome to Cloudflare Workers!
 * 
 * This is a headless proxy for your Gemini API requests.
 * 
 * 1. Deploy it to Cloudflare:
 *    npx wrangler deploy
 * 
 * 2. Set your Gemini API secret in the Cloudflare dashboard:
 *    npx wrangler secret put GEMINI_API_KEY
 * 
 * 3. In the React app, set VITE_CF_WORKER_URL to your worker's deployed URL
 *    (e.g., in your GitHub action or .env file before building)
 */

export interface Env {
  GEMINI_API_KEY: string;
  CORS_ORIGIN: string; 
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    
    // Check if it's a Gemini API endpoint
    if (url.pathname.startsWith('/v1beta/')) {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'generativelanguage.googleapis.com';
      targetUrl.port = '';
      targetUrl.protocol = 'https:';

      // Securely append the secret API key from the Worker environment
      if (env.GEMINI_API_KEY) {
        targetUrl.searchParams.set('key', env.GEMINI_API_KEY);
      } else {
        return new Response("GEMINI_API_KEY not configured on worker", { status: 500 });
      }

      // Forward request
      const proxyRequest = new Request(targetUrl.toString(), request);
      proxyRequest.headers.set('Host', 'generativelanguage.googleapis.com');

      const response = await fetch(proxyRequest);
      
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', env.CORS_ORIGIN || '*');
      return newResponse;
    }

    return new Response("Not found", { status: 404 });
  },
};
