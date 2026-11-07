import { publicConfig } from "@/lib/server/config";
import { exporterStatuses } from "@/lib/export/exporters";

export async function GET() {
  return Response.json({ ...publicConfig(), exporters: exporterStatuses() }, { headers: { "Cache-Control": "no-store" } });
}
