# Image And ZIP Export

AI Chat Export image and ZIP export run locally in the extension. They do not use remote rendering, external export servers, CDN code, telemetry, or broad browser permissions.

## PNG v1

- PNG export renders a semantic long image from the normalized conversation model.
- It is intended for moderate selected messages or range exports, not account-wide history capture.
- The maximum local PNG height is 16,000 px.
- If the generated image would exceed that height, AI Chat Export writes a local fallback text file explaining the limit instead of uploading content or using a server renderer.
- Non-ASCII text may use fallback glyphs in PNG v1 because the renderer uses a bundled bitmap font.

## ZIP Bundle

- ZIP is an output mode, not a normal file-format checkbox.
- Bundle entries use canonical names such as `conversation.md`, `conversation.json`, `conversation.html`, and `conversation.pdf`.
- `manifest.json` records source metadata, export settings, message count, completeness, file sizes, and file hashes.
- Embedded `data:image/*` assets are not written into text formats. When present, they are preserved in ZIP under `assets/` with hashed filenames and listed in the manifest.
- AI Chat Export does not create a ZIP when every selected export failed or every selected ZIP entry is unavailable.
