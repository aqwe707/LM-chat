#!/usr/bin/env node
/**
 * Agnes Image 2.1 Flash - Image Generation CLI
 *
 * Usage:
 *   node generate_image.js text <prompt> <size> [--url|--base64] [--save <path>]
 *   node generate_image.js img2img <prompt> <size> --image <url> [--url|--base64] [--save <path>]
 *
 * Examples:
 *   node generate_image.js text "A futuristic cityscape" 1024x768
 *   node generate_image.js text "cat on windowsill" 1024x1024 --save cat.jpg
 *   node generate_image.js img2img "Convert to anime style" 1024x768 --image https://example.com/photo.png
 */

import { argv, exit } from "process";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createReadStream } from "fs";
import { basename } from "path";

// ============================================================
// API KEY - Replace YOUR_API_KEY with your actual key
// ============================================================
const API_KEY = "sk-oDPZLxgnqOVmymSQHcX3gev7muq9w3NMTfBa00rLz2df0gOS";
const BASE_URL = "https://apihub.agnes-ai.com/v1/images/generations";
const MODEL = "agnes-image-2.1-flash";
const TIMEOUT_MS = 120_000; // 120 seconds

async function generateImage(prompt, size, imageUrls, outputFormat, savePath) {
  const payload = {
    model: MODEL,
    prompt,
    size,
  };

  const extra = {};
  if (imageUrls) {
    extra.image = imageUrls;
  }
  if (outputFormat === "url") {
    extra.response_format = "url";
  } else if (outputFormat === "b64_json") {
    extra.response_format = "b64_json";
  }

  if (Object.keys(extra).length > 0) {
    payload.extra_body = extra;
  }

  if (outputFormat === "b64_json" && !imageUrls) {
    payload.return_base64 = true;
  }

  console.log("Sending request to " + BASE_URL + " ...");
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("Request completed in " + elapsed + "s");

    if (!resp.ok) {
      const body = await resp.text();
      console.error("HTTP " + resp.status + ": " + body);
      exit(1);
    }

    const result = await resp.json();
    return processResult(result, outputFormat, savePath);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      console.error("Request timed out after " + TIMEOUT_MS / 1000 + "s");
    } else {
      console.error("Network error: " + err.message);
    }
    exit(1);
  }
}

async function processResult(result, outputFormat, savePath) {
  if (!result.data || !result.data.length) {
    console.error("Unexpected response: " + JSON.stringify(result, null, 2));
    exit(1);
  }

  const item = result.data[0];

  if (outputFormat === "url") {
    const url = item.url || item.b64_json;
    if (!url) {
      console.error("No URL in response: " + JSON.stringify(item, null, 2));
      exit(1);
    }
    console.log("Image URL: " + url);

    if (savePath) {
      await downloadImage(url, savePath);
    }
  } else if (outputFormat === "b64_json") {
    const b64 = item.b64_json;
    if (!b64) {
      console.error("No b64_json in response: " + JSON.stringify(item, null, 2));
      exit(1);
    }
    if (savePath) {
      const buffer = Buffer.from(b64, "base64");
      const ws = createWriteStream(savePath);
      ws.write(buffer);
      ws.end();
      await new Promise((resolve) => ws.on("finish", resolve));
      console.log("Image saved to: " + savePath + " (" + buffer.byteLength + " bytes)");
    } else {
      console.log("(Base64 output - set --save to write to file)");
    }
  }
}

async function downloadImage(url, savePath) {
  console.log("Downloading image to " + savePath + " ...");
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Download failed: HTTP " + resp.status);
      return;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const ws = createWriteStream(savePath);
    ws.write(buffer);
    ws.end();
    await new Promise((resolve) => ws.on("finish", resolve));
    console.log("Image saved to: " + savePath + " (" + buffer.byteLength + " bytes)");
  } catch (err) {
    console.error("Download failed: " + err.message);
  }
}

// --- CLI Parsing ---
function parseArgs() {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Agnes Image 2.1 Flash CLI

Usage:
  node generate_image.js text <prompt> <size> [--url|--base64] [--save <path>]
  node generate_image.js img2img <prompt> <size> --image <url> [--url|--base64] [--save <path>]

Examples:
  node generate_image.js text "A futuristic cityscape" 1024x768
  node generate_image.js text "cat on windowsill" 1024x1024 --save cat.jpg
  node generate_image.js img2img "Convert to anime style" 1024x768 --image https://example.com/photo.png
`);
    exit(0);
  }

  const workflow = args[0];
  const rest = args.slice(1);

  if (workflow !== "text" && workflow !== "img2img") {
    console.error("Unknown workflow: " + workflow + ' (use "text" or "img2img")');
    exit(1);
  }

  const prompt = rest[0];
  const size = rest[1];
  if (!prompt || !size) {
    console.error("Missing required arguments: <prompt> and <size>");
    exit(1);
  }

  let imageUrls = null;
  let outputFormat = "url";
  let savePath = null;

  for (let i = 2; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--image" && rest[i + 1]) {
      imageUrls = [rest[++i]];
    } else if (arg === "--url") {
      outputFormat = "url";
    } else if (arg === "--base64") {
      outputFormat = "b64_json";
    } else if (arg === "--save" && rest[i + 1]) {
      savePath = rest[++i];
    }
  }

  if (workflow === "img2img" && !imageUrls) {
    console.error("--image is required for img2img workflow");
    exit(1);
  }

  return { workflow, prompt, size, imageUrls, outputFormat, savePath };
}

// --- Main ---
const { workflow, prompt, size, imageUrls, outputFormat, savePath } = parseArgs();
const imageUrl = workflow === "img2img" ? imageUrls : undefined;

generateImage(prompt, size, imageUrl, outputFormat, savePath);