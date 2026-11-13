/**
 * Exporter contract. Implementations can be swapped (e.g. the in-house OFT
 * writer for an Aspose-backed service) without touching the editor.
 */

export type ExporterId = "oft" | "emltpl" | "html";

/** Three separate claims, never conflated. */
export interface ExporterVerification {
  /** Code exists that writes this format. */
  generation: "implemented" | "not-implemented";
  /** Automated structural checks (parsers in the test suite) pass. */
  structuralChecks: "passed" | "failed" | "not-run";
  /** Someone opened, edited and sent the file in the target Outlook app. */
  outlookManual: "not-verified" | "verified";
  notes: string;
}

export interface ExporterInfo {
  id: ExporterId;
  label: string;
  fileExtension: string;
  mimeType: string;
  target: string;
  /** Development-only output that is NOT an Outlook template. */
  developmentOnly: boolean;
  verification: ExporterVerification;
}

export interface ExporterAvailability {
  enabled: boolean;
  /** Required when disabled: the exact reason, shown in the UI. */
  reason?: string;
}

export interface ExportImage {
  /** Content-ID without angle brackets. */
  contentId: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif";
  data: Uint8Array;
  /** Relative path used by the HTML development export. */
  relativePath: string;
}

export interface ExportInput {
  subject: string;
  /** HTML with images referenced as cid:<contentId>. */
  htmlCid: string;
  /** HTML with images referenced by relative file path (development export). */
  htmlFiles: string;
  plainText: string;
  images: ExportImage[];
  baseFilename: string;
  /**
   * Set when the email has rounded buttons with pictures supplied: the body and images for the
   * Windows template, where each rounded button is a picture (classic Outlook rounds nothing else).
   */
  windows?: { htmlCid: string; images: ExportImage[] };
}

export interface ExportFile {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface Exporter {
  info: ExporterInfo;
  availability(): ExporterAvailability;
  export(input: ExportInput): Promise<ExportFile[]>;
}

export class ExporterUnavailableError extends Error {
  constructor(public exporterId: string, reason: string) {
    super(`Exporter "${exporterId}" is unavailable: ${reason}`);
    this.name = "ExporterUnavailableError";
  }
}

export class ExportFailedError extends Error {
  constructor(public exporterId: string, cause: unknown) {
    super(`Exporter "${exporterId}" failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ExportFailedError";
  }
}
