/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// If you want to use a shared secret to decrypt the Authorization header:
	// DECRYPTION_SECRET: string;
	
	// Or define a fixed API key environment variable in Cloudflare:
	GEMINI_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// 1. Handle CORS preflight for the browser
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
				},
			});
		}

		const url = new URL(request.url);

		// 2. Intercept Gemini API requests
		if (url.pathname.startsWith('/v1beta/')) {
			const authHeader = request.headers.get("Authorization");
			let apiKey = env.GEMINI_API_KEY;

			// 3. Handle the encrypted API Key from the frontend
			if (authHeader && authHeader.startsWith("Bearer ")) {
				const encryptedPayload = authHeader.replace("Bearer ", "");
				
				try {
					// Use standard base64 decoding matching the frontend's encryptApiKey
					// Note: atob in Cloudflare workers can decode base64 string
					apiKey = decodeURIComponent(atob(encryptedPayload));
				} catch (e) {
					apiKey = encryptedPayload; // Fallback
				}
			}

			if (!apiKey) {
				return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid API Key" }), { 
					status: 401,
					headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
				});
			}

			// 4. Proxy to the actual Google Gemini API
			const targetUrl = new URL(request.url);
			targetUrl.hostname = 'generativelanguage.googleapis.com';
			targetUrl.port = '';
			targetUrl.protocol = 'https:';
			targetUrl.searchParams.set('key', apiKey);

			// Clean up headers before forwarding to Google
			const proxyRequest = new Request(targetUrl.toString(), request);
			proxyRequest.headers.set('Host', 'generativelanguage.googleapis.com');
			proxyRequest.headers.delete('Authorization');

			try {
				const response = await fetch(proxyRequest);
				const newResponse = new Response(response.body, response);
				newResponse.headers.set('Access-Control-Allow-Origin', '*');
				return newResponse;
			} catch (error) {
				return new Response(JSON.stringify({ error: "Failed to proxy request" }), {
					status: 502,
					headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
				});
			}
		}

		return new Response("Not found", { status: 404 });
	},
};
