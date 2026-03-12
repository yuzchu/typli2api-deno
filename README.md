# typli2api (Deno Deploy)

把 **typli.ai** 的网页侧生成接口包装成 **OpenAI Compatible**：
- `GET /v1/models`
- `POST /v1/chat/completions` (supports `stream=true`)

## Deploy (Deno Deploy)

1. Create a new Deno Deploy project from this GitHub repo
2. Entry file: `main.ts`
3. Set Environment Variables:

- `AUTH_KEYS` (recommended): comma-separated downstream keys.
  - Example: `sk-CHANGE_ME_LONG_RANDOM_1,sk-CHANGE_ME_LONG_RANDOM_2`
  - If not set, defaults to `sk-default,sk-false` (NOT recommended).
- `DEBUG` (optional): `true`/`false` (default `true`)

## Use

Base URL: `https://<your-project>.deno.dev`

- List models:
  - `GET https://<host>/v1/models`
- Chat:
  - `POST https://<host>/v1/chat/completions`
  - Header: `Authorization: Bearer <one-of-AUTH_KEYS>`

## Notes

This is a web-to-api wrapper; stability depends on upstream typli.ai changes/rate limits.
