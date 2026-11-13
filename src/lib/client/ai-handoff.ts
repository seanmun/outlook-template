/**
 * Carries an AI request from the start page to the editor: what the person typed, plus the design
 * comp and pictures they attached. Kept in memory only (a comp can be megabytes, too big for
 * browser storage); it lasts for the in-app move to the editor and is used once.
 */
import type { CompAttachment, EmailImageAttachment } from "@/components/editor/ai-attachments";

export interface AiHandoff {
  instruction: string;
  comp: CompAttachment | null;
  images: EmailImageAttachment[];
}

const waiting = new Map<string, AiHandoff>();

export function setAiHandoff(emailId: string, handoff: AiHandoff) {
  waiting.set(emailId, handoff);
}

/** The request waiting for this email, if any. Reading it does not remove it (React may render twice). */
export function peekAiHandoff(emailId: string): AiHandoff | null {
  return waiting.get(emailId) ?? null;
}

export function clearAiHandoff(emailId: string) {
  waiting.delete(emailId);
}
