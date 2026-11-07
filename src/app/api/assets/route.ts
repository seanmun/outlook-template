import { errorResponse, uploadAsset } from "@/lib/server/handlers";
import { productionContext } from "@/lib/server/context";
import { MAX_UPLOAD_BYTES } from "@/lib/server/image-info";

export async function POST(req: Request) {
  const ctx = await productionContext();
  if (ctx instanceof Response) return ctx;
  if (!ctx.userId) return errorResponse(401, "Sign in required.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return errorResponse(413, "Image is too large.");
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return errorResponse(400, "Expected multipart form data with a 'file' field.");
  }
  return uploadAsset(ctx, file ? { data: new Uint8Array(await file.arrayBuffer()), name: file.name } : null);
}
