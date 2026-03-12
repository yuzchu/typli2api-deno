// Entry point for Deno Deploy
//
// The original upstream folder includes two implementations.
// `chat.js` is the more complete OpenAI-compatible wrapper (models + chat + SSE parsing)
// and tends to be the one that actually works with typli.ai's current endpoints.
//
// Keeping `main.ts` as a thin entry so Deno Deploy can use it as the project entry file.

import "./chat.ts";
