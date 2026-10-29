import Image from "next/image";

interface ImageVariant {
  url: string;
  width: number;
  height: number;
}

interface ResponsiveImageProps {
  desktop: ImageVariant;
  mobile?: ImageVariant | null;
  focal_point?: { x: number; y: number };
  alt: string;
  className?: string;
  priority?: boolean;
}

export function ResponsiveImage({
  desktop,
  mobile,
  focal_point,
  alt,
  className,
  priority = false,
}: ResponsiveImageProps) {
  const mobileUrl = mobile?.url || desktop.url;
  const objectPosition = focal_point
    ? `${focal_point.x * 100}% ${focal_point.y * 100}%`
    : "center";

  return (
    <>
      <Image
        src={desktop.url}
        alt={alt}
        width={desktop.width}
        height={desktop.height}
        className={`${className || ""} hidden md:block`}
        style={{ objectFit: "cover", objectPosition }}
        priority={priority}
      />
      <Image
        src={mobileUrl}
        alt={alt}
        width={mobile?.width || desktop.width}
        height={mobile?.height || desktop.height}
        className={`${className || ""} md:hidden`}
        style={{
          objectFit: "cover",
          objectPosition: mobile?.url ? "center" : objectPosition,
        }}
        priority={priority}
      />
    </>
  );
}
