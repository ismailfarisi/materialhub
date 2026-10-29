import { GoogleGenAI } from "@google/genai";
import { config } from "@materialhub/config";
import { ServiceUnavailableError } from "@materialhub/plugins";
import type { MediaService, ProcessedImages } from "@materialhub/utils";
// biome-ignore lint/style/useImportType: phash is a runtime function
import phash from "sharp-phash";

export interface EnhanceResult {
  candidateRawKey: string;
  processed: ProcessedImages;
  noChangeDetected: boolean;
}

export class AiEnhanceService {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Resolve the API key for a request. DB-stored key (from site_settings)
   * wins; env var is the fallback for backwards compatibility with the
   * existing deploy pipeline.
   */
  private resolveKey(providedKey: string | undefined): string {
    const k = providedKey?.trim() || config.google.geminiApiKey;
    if (!k) {
      throw new ServiceUnavailableError("Gemini API key not configured");
    }
    return k;
  }

  async enhance(input: {
    sourceKey: string;
    prompt: string;
    model: string;
    candidateUuid: string;
    apiKey?: string;
  }): Promise<EnhanceResult> {
    const client = new GoogleGenAI({ apiKey: this.resolveKey(input.apiKey) });

    const sourceBuf = await this.mediaService.downloadBuffer(input.sourceKey);
    const base64 = sourceBuf.toString("base64");

    const resp = await Promise.race([
      client.models.generateContent({
        model: input.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: base64 } },
              { text: input.prompt },
            ],
          },
        ],
        config: { responseModalities: ["IMAGE"] },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enhance timeout")), 30_000)),
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: SDK response shape
    const r = resp as any;
    const candidate = r?.candidates?.[0]?.content?.parts?.find(
      // biome-ignore lint/suspicious/noExplicitAny: SDK part shape
      (p: any) => p.inlineData?.data,
    );
    if (!candidate) throw new Error("Gemini returned no image");
    const resultBuf = Buffer.from(candidate.inlineData.data, "base64");

    // pHash similarity (64-bit Hamming distance → similarity 0..1)
    const [a, b] = await Promise.all([phash(sourceBuf), phash(resultBuf)]);
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    const similarity = same / a.length;
    const noChangeDetected = similarity >= 0.98;

    const rawKey = `pending/${input.candidateUuid}/raw.png`;
    await this.mediaService.uploadBuffer(rawKey, resultBuf, "image/png");

    const processed = await this.mediaService.processImage(rawKey, input.candidateUuid);

    return { candidateRawKey: rawKey, processed, noChangeDetected };
  }
}
