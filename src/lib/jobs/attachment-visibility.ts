// 2026-10-27, user request (Mechanic view): the Attachments section is not for mechanics, only Photos.
// Photos (the Photos section of a job) are images only; everything else is an Attachment.
export const PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function attachmentVisibleTo(ctx: { tenantRole?: string | null }, attachment: { isPhoto: boolean }): boolean {
  return ctx.tenantRole !== "USER" || attachment.isPhoto;
}

// A mechanic can only add photos, and a file added through the Photos section must be an image.
export function uploadAsPhoto(ctx: { tenantRole?: string | null }, requested: boolean | undefined): boolean {
  return requested === true || ctx.tenantRole === "USER";
}

export function photoTypeAllowed(mimeType: string): boolean {
  return PHOTO_MIME_TYPES.includes(mimeType);
}
