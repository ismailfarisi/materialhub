import { AppDataSource, VendorDocument } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class VendorDocumentService {
  private get repo() {
    return AppDataSource.getRepository(VendorDocument);
  }

  async upload(
    vendorId: string,
    docType: string,
    s3Key: string,
    fileName: string,
    opts?: { expiryDate?: string; fileSize?: number; mimeType?: string },
  ) {
    const existing = await this.repo.findOne({
      where: { vendor_id: vendorId, type: docType as any },
    });

    if (existing) {
      if (existing.is_verified) {
        throw new HttpError(409, "Document already verified", "DOC_ALREADY_VERIFIED");
      }
      existing.file_url = s3Key;
      existing.file_name = fileName;
      existing.is_verified = false;
      existing.rejection_reason = null;
      if (opts?.expiryDate) existing.expiry_date = new Date(opts.expiryDate) as any;
      if (opts?.fileSize != null) existing.file_size = opts.fileSize;
      if (opts?.mimeType) existing.mime_type = opts.mimeType;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({
        vendor_id: vendorId,
        type: docType as any,
        file_url: s3Key,
        file_name: fileName,
        is_verified: false,
        expiry_date: opts?.expiryDate ? (new Date(opts.expiryDate) as any) : null,
        file_size: opts?.fileSize ?? null,
        mime_type: opts?.mimeType ?? null,
      }),
    );
  }

  async list(vendorId: string) {
    return this.repo.find({
      where: { vendor_id: vendorId },
      order: { created_at: "ASC" },
    });
  }

  async verify(docId: string, adminId: string) {
    const doc = await this.repo.findOne({ where: { id: docId } });
    if (!doc) throw new HttpError(404, "Document not found", "DOC_NOT_FOUND");
    if (doc.is_verified)
      throw new HttpError(409, "Document already verified", "DOC_ALREADY_VERIFIED");

    doc.is_verified = true;
    doc.verified_at = new Date();
    doc.verified_by = adminId;
    doc.rejection_reason = null;
    return this.repo.save(doc);
  }

  async reject(docId: string, reason: string) {
    const doc = await this.repo.findOne({ where: { id: docId } });
    if (!doc) throw new HttpError(404, "Document not found", "DOC_NOT_FOUND");

    doc.is_verified = false;
    doc.verified_at = null;
    doc.verified_by = null;
    doc.rejection_reason = reason;
    return this.repo.save(doc);
  }

  async update(
    docId: string,
    opts: {
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      expiryDate?: string;
    },
  ) {
    const doc = await this.repo.findOne({ where: { id: docId } });
    if (!doc) throw new HttpError(404, "Document not found", "DOC_NOT_FOUND");

    if (opts.fileUrl) {
      doc.file_url = opts.fileUrl;
      doc.is_verified = false;
      doc.verified_at = null;
      doc.verified_by = null;
      doc.rejection_reason = null;
    }
    if (opts.fileName != null) doc.file_name = opts.fileName;
    if (opts.fileSize != null) doc.file_size = opts.fileSize;
    if (opts.mimeType != null) doc.mime_type = opts.mimeType;
    if (opts.expiryDate) doc.expiry_date = new Date(opts.expiryDate) as any;

    return this.repo.save(doc);
  }

  async delete(docId: string) {
    const doc = await this.repo.findOne({ where: { id: docId } });
    if (!doc) throw new HttpError(404, "Document not found", "DOC_NOT_FOUND");
    await this.repo.softDelete(docId);
  }
}
