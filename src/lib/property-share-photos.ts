"use client";
import { slugify, type Property } from "./model";
import { approvedPropertyImages } from "./property-images";

const maxPhotoBytes = 12 * 1024 * 1024;
const maxTotalBytes = 100 * 1024 * 1024;
export class PropertyPhotoExportError extends Error {}

async function photoBlob(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.any([
      AbortSignal.timeout(30000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (
    !response.ok ||
    !/^image\/(jpeg|png|webp)(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    Number(response.headers.get("content-length")) > maxPhotoBytes
  )
    throw new PropertyPhotoExportError(
      "O fotografie nu a putut fi descărcată. Încearcă din nou.",
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new PropertyPhotoExportError("Fotografia nu este disponibilă.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxPhotoBytes) {
      await reader.cancel();
      throw new PropertyPhotoExportError(
        "Fotografia este prea mare. Selectează alte imagini.",
      );
    }
    chunks.push(new Uint8Array(part.value));
  }
  return new Blob(chunks, { type: response.headers.get("content-type")! });
}

async function asJpeg(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 40000000
    )
      throw new PropertyPhotoExportError(
        "Fotografia nu poate fi pregătită. Selectează alte imagini.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new PropertyPhotoExportError(
        "Browserul nu a putut pregăti fotografia.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (jpeg) =>
          jpeg?.type === "image/jpeg"
            ? resolve(jpeg)
            : reject(
                new PropertyPhotoExportError(
                  "Fotografia nu a putut fi pregătită în format JPG.",
                ),
              ),
        "image/jpeg",
        0.92,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export async function downloadSharePhotos(
  property: Property,
  selected: number[],
  text: string,
  onProgress: (completed: number) => void,
  signal?: AbortSignal,
) {
  const images = approvedPropertyImages(
    property,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  );
  const indices = [...new Set(selected)].sort((a, b) => a - b);
  if (
    !images ||
    !indices.length ||
    indices.some((index) => !Number.isInteger(index) || !images[index])
  )
    throw new PropertyPhotoExportError(
      "Selectează fotografiile pe care vrei să le descarci.",
    );
  // Build the archive on the device: no large response through the web host,
  // and one download instead of multiple browser permission prompts.
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {
    "text-postare.txt": strToU8(text),
  };
  let totalBytes = 0;
  for (const [position, index] of indices.entries()) {
    signal?.throwIfAborted();
    const original = await photoBlob(images[index], signal);
    const jpeg = await asJpeg(original);
    totalBytes += original.size + jpeg.size;
    if (totalBytes > maxTotalBytes)
      throw new PropertyPhotoExportError(
        "Fotografiile selectate sunt prea mari pentru o singură descărcare. Descarcă-le în grupuri mai mici.",
      );
    files[`fotografie-${String(position + 1).padStart(2, "0")}.jpg`] =
      new Uint8Array(await jpeg.arrayBuffer());
    onProgress(position + 1);
  }
  signal?.throwIfAborted();
  const archive = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(archive)], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(property.title)}-facebook.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
