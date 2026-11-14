/** Where a picture is still used, by name. An image in use cannot be deleted, so nothing is left with a hole in it. */
export interface ImageUsage {
  emails: string[];
  templates: string[];
  blocks: string[];
}

export const imageIsUsed = (u: ImageUsage) => u.emails.length + u.templates.length + u.blocks.length > 0;

/** True when this email, template or saved block holds the picture with this id. */
export function usesImage(value: unknown, assetId: string): boolean {
  return JSON.stringify(value ?? null).includes(JSON.stringify(assetId));
}

function part(names: string[], one: string, many: string): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).map((n) => `“${n}”`).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${names.length} ${names.length === 1 ? one : many} (${shown}${more})`;
}

/** The plain explanation shown when someone tries to delete a picture that is still in use. */
export function imageInUseMessage(u: ImageUsage): string {
  const parts = [part(u.emails, "email", "emails"), part(u.templates, "template", "templates"), part(u.blocks, "saved block", "saved blocks")].filter((p): p is string => !!p);
  const where = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `This image is used in ${where}. Remove it from there first, then delete it.`;
}
