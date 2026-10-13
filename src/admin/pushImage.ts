import { imgUrl } from "../lib";
import { adminApi } from "./api";

/** Android's expanded notification is 2:1, and FCM skips images over 1 MB. */
const WIDTH = 1200;
const HEIGHT = 600;
const MAX_BYTES = 950 * 1024;

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//.test(src) && !src.startsWith(window.location.origin)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded"));
    img.src = src;
  });
}

const bytesOf = (dataUrl: string) => Math.ceil(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * Crop `url` to 2:1 (centre, like the previews) and re-encode it as a JPEG
 * small enough for push, uploading the result to the media library.
 * Returns the new URL, or the original when it is already push-ready or
 * can't be processed (e.g. a cross-origin image without CORS).
 */
export async function preparePushImage(url: string): Promise<string> {
  if (!url) return url;
  try {
    const img = await load(imgUrl(url));
    if (url.startsWith("/img/uploads/") && img.naturalWidth === WIDTH && img.naturalHeight === HEIGHT) return url;

    const width = Math.min(WIDTH, Math.max(img.naturalWidth, 600));
    const height = Math.round(width / 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return url;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);

    let data = "";
    for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
      data = canvas.toDataURL("image/jpeg", quality);
      if (bytesOf(data) <= MAX_BYTES) break;
    }
    const { file } = await adminApi.uploadMedia(`push-${Date.now()}.jpg`, data);
    return file.url;
  } catch {
    return url;
  }
}
