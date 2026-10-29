import type { AxiosInstance } from "axios";
import type { S3UploadClient } from "../../hooks/use-s3-upload";

export type LayoutEditorMode = "platform" | "vendor";

export interface SectionType {
	id: string;
	name: string;
	label: Record<string, string>;
	icon?: string;
	scope?: "platform" | "vendor" | "both";
	supports_bidding?: boolean;
}

export interface Section {
	id: string;
	position: number;
	source_mode: "manual" | "query" | "bidded";
	enabled: boolean;
	visibility: { mobile: boolean; web: boolean } | string[];
	settings?: Record<string, unknown>;
	data_source?: Record<string, unknown>;
	blocks?: unknown[];
	bid_config?: Record<string, unknown>;
	section_type: SectionType;
}

export interface Layout {
	id: string;
	slug: string;
	title: Record<string, string>;
	status: "draft" | "published" | "scheduled" | "archived";
	published_version_id: string | null;
	draft_version_id: string | null;
	vendor_id: string | null;
	sections?: Section[];
}

export interface LayoutEditorProps {
	/** Pre-configured axios instance with auth headers and base URL pointing at the API gateway. */
	apiClient: AxiosInstance;
	/** Layout id to edit. */
	layoutId: string;
	/** Editor mode — restricts section-type picker and source-mode options. */
	mode: LayoutEditorMode;
	/** API path prefix. Admin uses `/admin/layouts`; vendor uses `/vendor-layouts`. */
	apiPathPrefix: string;
	/**
	 * S3 upload client — when provided, image fields in section configs render
	 * the file-upload widget instead of a raw URL input. Required for the
	 * editor to feel modern; consumers without an S3 backend can omit it and
	 * fall back to URL inputs.
	 */
	s3Client?: S3UploadClient;
	/** Optional vendor scope passed to S3 presign requests. */
	vendorId?: string;
	/**
	 * Called when the user clicks Preview. Receives the editor's layoutId so
	 * the host app can request a draft-preview token and open the storefront
	 * URL with it. If omitted, the Preview button is hidden.
	 */
	onPreview?: (layoutId: string) => void | Promise<void>;
	/** Called after a successful publish. */
	onPublishSuccess?: () => void;
	/** Optional back navigation handler. If absent, the back button is hidden. */
	onBack?: () => void;
}
