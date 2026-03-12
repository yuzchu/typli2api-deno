// Deno Deploy Edge Script - OpenAI Compatible API Proxy

// ========== Configuration ==========

const BASE_URL = "https://typli.ai";

const AUTH_KEYS = (Deno.env.get("AUTH_KEYS") || "sk-default,sk-false")
  .split(",")
  .map((k) => k.trim());

const USER_AGENT_LIST = [
  { name: "Chrome_Android", value: "Mozilla/5.0 (Linux; Android 14; V2118A Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36" },
  { name: "Chrome_Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36" },
  { name: "Safari_macOS", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" },
  { name: "Firefox_Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0" },
  { name: "Edge_Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0" }
];

const MODELS_LIST = ["gpt-4o", "gpt-4o-mini", "gemini-2.5-pro", "claude-3.5-sonnet", "claude-4.5-sonnet"];

// ========== Helper Functions ==========

function generateId(): string {
  return crypto.randomUUID();
}

function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function isValidAuthKey(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const key = authHeader.substring(7);
  return AUTH_KEYS.includes(key);
}

function getRandomUserAgent(): string {
  const randomIndex = Math.floor(Math.random() * USER_AGENT_LIST.length);
  return USER_AGENT_LIST[randomIndex].value;
}

function setCORSHeaders(headers: Headers): void {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
}

// ========== Request Handlers ==========

async function handleModels(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  
  if (!isValidAuthKey(authHeader)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const timestamp = getCurrentTimestamp();
  const modelsResponse = {
    object: "list",
    data: MODELS_LIST.map((model) => ({
      id: model,
      object: "model",
      created: timestamp,
      owned_by: "typli",
    })),
  };

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  setCORSHeaders(headers);

  return new Response(JSON.stringify(modelsResponse), { headers });
}

async function handleChatCompletions(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  
  if (!isValidAuthKey(authHeader)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const {
    messages,
    stream = false,
    model = "gpt-4o",
    temperature = 1.2,
  } = body;

  // Construct forwarding request
  const forwardHeaders = new Headers();
  forwardHeaders.set("Content-Type", "application/json");
  forwardHeaders.set("User-Agent", "ai-sdk/5.0.76 runtime/browser");
  forwardHeaders.set("User-Agent", getRandomUserAgent());
  forwardHeaders.set("Referer", "https://typli.ai/ai-writer");

  const forwardBody = JSON.stringify({
    prompt: "",
    temperature,
    messages,
  });

  const forwardRequest = new Request(`${BASE_URL}/api/generators/completion`, {
    method: "POST",
    headers: forwardHeaders,
    body: forwardBody,
  });

  const response = await fetch(forwardRequest);

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Upstream API error" }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (stream) {
    return handleStreamResponse(response, model);
  } else {
    return handleNonStreamResponse(response, model);
  }
}

async function handleStreamResponse(
  upstreamResponse: Response,
  model: string
): Promise<Response> {
  const id = generateId();
  const created = getCurrentTimestamp();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // First chunk
      const firstChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: null, reasoning_content: null },
            logprobs: null,
            finish_reason: null,
          },
        ],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(firstChunk)}\n\n`));

      // Stream content chunks
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            const chunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: line + "\n", reasoning_content: null },
                  logprobs: null,
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
        }
      }

      // Send remaining buffer if any
      if (buffer.trim()) {
        const chunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { content: buffer, reasoning_content: null },
              logprobs: null,
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }

      // Final chunk with usage
      const finalChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { content: "", reasoning_content: null },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          completion_tokens_details: { reasoning_tokens: 0 },
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-store");
  setCORSHeaders(headers);

  return new Response(stream, { headers });
}

async function handleNonStreamResponse(
  upstreamResponse: Response,
  model: string
): Promise<Response> {
  const id = generateId();
  const created = getCurrentTimestamp();
  const content = await upstreamResponse.text();

  const responseBody = {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content,
          reasoning_content: null,
        },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  };

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  setCORSHeaders(headers);

  return new Response(JSON.stringify(responseBody), { headers });
}

function handleOptions(): Response {
  const headers = new Headers();
  setCORSHeaders(headers);
  return new Response(null, { headers, status: 200 });
}

function handleHealthCheck(): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  setCORSHeaders(headers);
  return new Response(JSON.stringify({ status: "healthy" }), {
    status: 200,
    headers,
  });
}

// ========== Main Server ==========

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle OPTIONS preflight requests
  if (method === "OPTIONS") {
    return handleOptions();
  }

  // Health check for root path
  if (method === "GET" && path === "/") {
    return handleHealthCheck();
  }

  // Routes
  if (method === "GET" && path === "/v1/models") {
    return handleModels(req);
  }

  if (method === "POST" && path === "/v1/chat/completions") {
    return handleChatCompletions(req);
  }

  // 404 Not Found
  const headers = new Headers();
  setCORSHeaders(headers);
  return new Response(
    JSON.stringify({ error: "Not Found", message: `Route ${method} ${path} not found` }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
});
