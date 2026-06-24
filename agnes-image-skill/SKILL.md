---
name: agnes-image
description: Generate and edit images using the Agnes Image 2.1 Flash model (Sapiens AI). Supports text-to-image and image-to-image workflows with URL or Base64 output. Use when the user asks to generate images from text descriptions, edit/transform existing images, create marketing visuals, concept art, posters, product images, social media assets, or any image generation task via the Agnes AI API. Triggers on requests like "generate an image of", "create a picture of", "image generation", "img2img", "文生图", "图生图".
---

# Agnes Image 2.1 Flash Skill

Generate and edit images using the Agnes Image 2.1 Flash model via the Sapiens AI API.

## API Reference

- **Endpoint**: `POST https://apihub.agnes-ai.com/v1/images/generations`
- **Auth**: `Authorization: Bearer YOUR_API_KEY`
- **Model name**: `agnes-image-2.1-flash`
- **Price**: $0.003 per image

## Prerequisites

1. Set `API_KEY` in `scripts/generate_image.js` (line 23)
2. Node.js 18+ (uses built-in `fetch`)

## Workflows

### Text-to-Image (文生图)

Required: `model`, `prompt`, `size`

```
node scripts/generate_image.js text "A futuristic cityscape" 1024x768
```

Options:
- `--url` — return image URL (default)
- `--base64` — return Base64-encoded image data
- `--save <path>` — download/save image to file

### Image-to-Image (图生图)

Required: `model`, `prompt`, `size`, `--image <url_or_base64>`

```
node scripts/generate_image.js img2img "Convert to cyberpunk style" 1024x768 --image https://example.com/input.png
```

Options:
- `--image <url|base64>` — input image URL or Data URI (required for img2img)
- `--url` / `--base64` — output format

## Prompt Best Practices

- **Text-to-image**: Describe subject, environment, style, lighting, composition, details
- **Image-to-image**: `[modification]` + `[new style/scenario]` + `[add/remove elements]` + `[preserve elements]`
- **High-density scenes**: Explicitly describe visual hierarchy — main subject, background, secondary elements, style/lighting, composition constraints

## Important Rules

- Never put `response_format` at the request body top level — it must go inside `extra_body`
- Image-to-image does NOT need `tags: ["img2img"]`
- Input images must be publicly accessible HTTPS URLs or Data URI Base64
- Set client timeout to 60s–360s
- Use `YOUR_API_KEY` placeholder in public docs