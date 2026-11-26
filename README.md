# AI Sticker MCP Starter

A small, private starter kit for giving an AI a **semantic sticker library** without putting image binaries into every model request.

The core idea is:

```text
image storage + semantic metadata + read-only MCP search
```

The model sees only a short menu (`id`, name, alt text, tags, usage guidance and URL), then decides whether a sticker is more useful than plain text. Images remain in your own storage.

> This repository is a reusable starter, not a copy of any production deployment. It contains no private stickers, credentials, domains, account IDs, database dumps or access policies.

## What this starter includes

- A JSON sticker catalog with semantic metadata
- Full-text-ish weighted search over names, aliases, tags, tone and usage notes
- `exclude_ids` and `cooldown_turns` support to reduce repetition
- Four read-only MCP tools:
  - `list_packs`
  - `search_stickers`
  - `get_sticker`
  - `random_sticker`
- A Streamable HTTP MCP endpoint at `/mcp`
- Health endpoint at `/health`

## Architecture

```text
Your image host / R2 / S3
        │
        ├── stable image URLs
        │
Sticker metadata (JSON or database)
        │
        └── MCP server → AI client
                         ├── searches 3–5 candidates
                         ├── chooses one or chooses none
                         └── renders the stable URL
```

For a larger deployment, Cloudflare R2 is a convenient image store and D1 can replace the JSON catalog. A private image-management UI may be placed behind Cloudflare Access. The public image route should contain only non-sensitive material.

## Quick start

Requirements: Node.js 20+

```bash
npm install
cp .env.example .env
npm start
```

Then connect an MCP client to:

```text
http://localhost:8788/mcp
```

Test health:

```bash
curl http://localhost:8788/health
```

## Catalog format

Copy `data/stickers.example.json` to your own catalog and edit the entries.

```json
{
  "id": "demo-dog-kiss",
  "pack": "Demo Dog",
  "name": "Kiss",
  "aliases": ["smooch"],
  "url": "https://example.com/stickers/dog/kiss.png",
  "mime": "image/png",
  "animated": false,
  "alt": "A small white dog sending a kiss",
  "tags": ["kiss", "affection", "happy"],
  "tone": ["affectionate", "playful"],
  "usage_note": "Use for a light affectionate reply.",
  "avoid_when": ["unresolved serious conflict"],
  "cooldown_turns": 10,
  "review_status": "reviewed",
  "enabled": true
}
```

The important fields are `alt`, `tags`, `tone`, `usage_note` and `avoid_when`. Do not turn a short filename into an invented visual description. Human-reviewed metadata should not be overwritten by future imports.

## Suggested AI behavior

The MCP only returns candidates. It should **not force a sticker into every reply**. A useful decision flow is:

```text
understand the current conversation
→ decide whether non-verbal expression helps
→ search 3–5 candidates
→ exclude recently used IDs
→ pick one, or send no sticker
→ render the stable URL
```

Recommended rules:

- Do not call the sticker MCP on every turn.
- In grief, conflict or safety-sensitive contexts, prefer direct language first.
- Respect `avoid_when` and `cooldown_turns`.
- Never infer private facts from a sticker filename.
- Keep recent sticker IDs in the client/session and pass them as `exclude_ids`.
- The final choice belongs to the AI responding in context, not the search service.

## Privacy and copyright

- Do not store passwords, private photos, intimate images or identifying documents in a public image route.
- A stable image URL is usually accessible to anyone who knows it. Treat it as public-by-link.
- Put upload, edit and delete operations behind authentication.
- Use only media you created or have permission to store and share.
- Keep source attribution and original URLs where licensing requires it.
- This starter intentionally exposes no write tools to the model.

## Moving from JSON to R2 + D1

A practical production split is:

```text
R2: image binaries
D1: metadata, aliases, tags, review state and usage counters
Worker: stable image route + private management API
MCP: read-only semantic search
```

Keep migration scripts idempotent:

1. Download with redirects enabled.
2. Verify status, MIME type, file signature and decodability.
3. Detect the real format, including animated WebP.
4. Hash with SHA-256 and deduplicate by content.
5. Preserve aliases for duplicate names.
6. Never overwrite reviewed metadata during re-import.
7. Record failures and retry safely.

## Security boundary

This starter is deliberately read-only. Editing tags, disabling files and deleting media belong in a separate authenticated management surface. If write tools are later added, require explicit confirmation and audit every change.

## License

MIT for the starter code. Sticker media is not included and remains subject to its own copyright and license.
