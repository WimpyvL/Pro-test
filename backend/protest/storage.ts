import { randomUUID } from "node:crypto";

import { Bucket } from "encore.dev/storage/objects";

const reportAssets = new Bucket("report-images", {
  public: true,
});

interface ParsedDataUrl {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

export function resolveImageSource(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return reportAssets.publicUrl(value);
}

export async function uploadReportAsset(dataUrl: string, prefix: string) {
  const parsed = parseDataUrl(dataUrl);
  const objectKey = `${prefix}/${randomUUID()}.${parsed.extension}`;
  await reportAssets.upload(objectKey, parsed.buffer, {
    contentType: parsed.contentType,
  });
  return objectKey;
}

export async function removeReportAsset(objectKey: string | null) {
  if (!objectKey || objectKey.startsWith("data:") || objectKey.startsWith("http://") || objectKey.startsWith("https://")) {
    return;
  }

  await reportAssets.remove(objectKey);
}

function parseDataUrl(value: string): ParsedDataUrl {
  const match = value.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Expected media data URL.");
  }

  const contentType = match[1];
  const extension = mimeToExtension(contentType);
  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType,
    extension,
  };
}

function mimeToExtension(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/webm":
      return "webm";
    case "video/mp4":
      return "mp4";
    default:
      return "bin";
  }
}
