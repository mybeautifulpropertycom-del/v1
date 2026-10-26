import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";

export const VIDEO_LIMIT = 50 * 1024 * 1024;
export function publicIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function mediaType(bytes: Buffer) {
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp")
    return { type: "video/mp4", extension: "mp4" };
  if (
    bytes.length >= 4 &&
    bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  )
    return { type: "video/webm", extension: "webm" };
  throw new Error("The provider did not return an MP4 or WebM video.");
}
/** Download without credentials. Resolve/pin public IPv4 on every redirect. */
export async function downloadVideo(
  raw: string,
): Promise<{ bytes: Buffer; type: string; extension: string }> {
  const signal = AbortSignal.timeout(30000);
  let url = new URL(raw);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      throw new Error("Invalid video download URL.");
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
      throw new Error("The video host is not publicly routable.");
    if (signal.aborted) throw new Error("Video download timed out.");
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(
        url,
        {
          signal,
          agent: false,
          lookup: (_host, options, callback) => {
            // Pin the validated address; DNS cannot change between validation and connection.
            if (options.all)
              callback(null, [{ address: addresses[0].address, family: 4 }]);
            else callback(null, addresses[0].address, 4);
          },
          headers: { Accept: "video/mp4,video/webm,application/octet-stream" },
        },
        resolve,
      );
      req.on("error", reject);
      req.end();
    });
    if (
      [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
      response.headers.location
    ) {
      url = new URL(response.headers.location, url);
      response.destroy();
      continue;
    }
    if (
      response.statusCode !== 200 ||
      Number(response.headers["content-length"]) > VIDEO_LIMIT
    ) {
      response.destroy();
      throw new Error("Video download is unavailable or exceeds 50 MB.");
    }
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of response) {
      length += chunk.length;
      if (length > VIDEO_LIMIT) {
        response.destroy();
        throw new Error("Video exceeds the 50 MB storage limit.");
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return { bytes, ...mediaType(bytes) };
  }
  throw new Error("Too many video redirects.");
}
