import { publicGet } from "@/lib/api-public";
import { API_URL } from "@/lib/seo/config";
import axios from "axios";
import { NextResponse } from "next/server";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

interface AffiliateResolveData {
  code: string;
  targetType: "store" | "product" | "brand" | "custom_url";
  targetId: string | null;
  targetUrl: string | null;
  vendorId: string;
}

interface BrandSummary {
  id: string;
  slug: string;
}

interface ProductSummary {
  id: string;
  slug: string;
}

// Behind Caddy on the prod frontend box, Next's standalone server builds
// request.url from its bind address (http://0.0.0.0:4000), so redirects must
// use the public host the proxy forwards instead.
function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(request: Request, { params }: Props) {
  const { locale, slug } = await params;
  const origin = publicOrigin(request);

  // Resolving a slug increments its click counter server-side, so this must hit
  // the API on every request — go around `publicGet`'s `unstable_cache` wrapper
  // (which is for cacheable, side-effect-free catalog reads) entirely.
  let resolveData: AffiliateResolveData | null = null;
  try {
    const res = await axios.get<{ data: AffiliateResolveData }>(`${API_URL}/a/${slug}`, {
      timeout: 15000,
      headers: { "Accept-Language": locale },
    });
    resolveData = res.data?.data ?? null;
  } catch {
    resolveData = null;
  }

  if (!resolveData?.code) {
    return NextResponse.redirect(new URL(`/${locale}`, origin));
  }

  const { code, targetType, targetId, targetUrl, vendorId } = resolveData;

  let destination = `/${locale}`;

  if (targetType === "brand" && targetId) {
    try {
      const brands = await publicGet<BrandSummary[]>(`/brands?ids=${targetId}`, {
        revalidate: 3600,
        locale,
      });
      const brandSlug = brands?.[0]?.slug ?? targetId;
      destination = `/${locale}/brand/${brandSlug}`;
    } catch {
      destination = `/${locale}/brand/${targetId}`;
    }
  } else if (targetType === "product" && targetId) {
    try {
      const product = await publicGet<ProductSummary>(`/products/${targetId}`, {
        revalidate: 300,
        locale,
      });
      const productSlug = product?.slug ?? targetId;
      destination = `/${locale}/product/${productSlug}`;
    } catch {
      destination = `/${locale}/product/${targetId}`;
    }
  } else if (targetType === "store" && vendorId) {
    destination = `/${locale}/vendor/${vendorId}`;
  } else if (targetType === "custom_url" && targetUrl) {
    const trimmed = targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`;
    // Avoid double locale if targetUrl already starts with /en or /ar
    if (trimmed.startsWith(`/${locale}/`) || trimmed === `/${locale}`) {
      destination = trimmed;
    } else if (/^\/(en|ar)(\/|$)/.test(trimmed)) {
      destination = trimmed.replace(/^\/(en|ar)/, `/${locale}`);
    } else {
      destination = `/${locale}${trimmed}`;
    }
  }

  const sep = destination.includes("?") ? "&" : "?";
  const redirectUrl = new URL(`${destination}${sep}aff=${encodeURIComponent(code)}`, origin);

  const response = NextResponse.redirect(redirectUrl);
  // Set the 30-day affiliate attribution cookie. Route handlers (unlike page
  // Server Components) are allowed to mutate cookies on the response.
  response.cookies.set("nl_aff", code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });
  return response;
}
