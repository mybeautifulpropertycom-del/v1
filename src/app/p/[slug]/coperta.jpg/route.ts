import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getPublished } from "@/lib/published-property";
import {
  propertyShareSource,
  shareImageVersion,
} from "@/lib/property-share-image";
import {
  HOME_SHARE_IMAGE,
  SHARE_IMAGE_WIDTH,
  SHARE_IMAGE_HEIGHT,
  siteUrl,
} from "@/lib/seo";

export const runtime = "nodejs";

const maxCoverBytes = 10 * 1024 * 1024;

async function readStoragePhoto(url: URL) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (
    !response.ok ||
    !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    Number(response.headers.get("content-length")) > maxCoverBytes
  ) {
    await response.body?.cancel();
    throw new Error("Share photo is unavailable.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Share photo is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxCoverBytes) {
      await reader.cancel();
      throw new Error("Share photo is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/p/[slug]/coperta.jpg">,
) {
  const { slug } = await params;
  const data = await getPublished(slug);
  if (data?.property.status !== "published")
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });

  const source = propertyShareSource(data.property.images[0]);
  if (source) {
    try {
      const original =
        typeof source === "string"
          ? await readFile(path.join(process.cwd(), "public", source.slice(1)))
          : await readStoragePhoto(source);
      const image = await sharp(original, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, { fit: "cover" })
        .flatten({ background: "#fff" })
        .jpeg({ quality: 82 })
        .toBuffer();
      const requestedVersion = new URL(request.url).searchParams.get("v");
      return new Response(new Uint8Array(image), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control":
            requestedVersion === shareImageVersion(source)
              ? "public, max-age=300, s-maxage=900"
              : "no-store",
        },
      });
    } catch {
      // A missing or corrupt cover is temporary and shouldn't cache the fallback.
    }
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: siteUrl(HOME_SHARE_IMAGE),
      "Cache-Control": "no-store",
    },
  });
}
