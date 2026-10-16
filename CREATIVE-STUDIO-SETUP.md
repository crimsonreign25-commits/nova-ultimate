# NOVA Ultimate 21.4.0 — Creative Studio setup

## Website/app previews
Creative Studio is available in the normal user-facing interface. It generates a responsive starter HTML file, provides a sandboxed preview, and lists practical suggestions. Exported HTML is a prototype; demo buttons and forms must be connected to real services before production use.

## High-definition image generation
NOVA owns the provider adapter in `core/creative-studio.js`. Configure these variables in Render (Environment), never in browser code or GitHub source:

- `NOVA_IMAGE_API_URL`: endpoint for a compatible image-generation API.
- `NOVA_IMAGE_API_KEY`: secret API key for that endpoint.

The adapter sends `prompt`, `size`, `quality`, and `n: 1`. It accepts common response formats `data[0].url`, `data[0].b64_json`, `images[0].url`, or `data_url`. Supported requested dimensions are `1024x1024`, `1536x1024`, and `1024x1536`; the provider determines actual output dimensions and quality. If no provider is configured, the app returns a clear setup message instead of pretending an image was created. Check the provider's documentation for its exact request/response schema and pricing/free limits.

## Access boundaries
The user-facing preview/image controls are separate from internal Builder Mode. Administrative workspace APIs and access audit controls retain server-side role checks. Do not put API keys in `.env` files committed to GitHub; set secrets in Render environment variables.

## Validation
Run `npm run test:syntax` and `npm test`. These tests verify local behavior; they do not verify a live Render deployment or the external image provider.
