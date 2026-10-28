import Image from "next/image";

/**
 * The approved دلّني logo. Both theme variants are rendered and CSS shows the right one
 * (`.dark` on <html>), so it switches instantly with the theme and never flashes.
 * Next/Image serves resized WebP/AVIF from the full-resolution PNGs in /public/branding.
 */
const FILES = {
  full: { light: "/branding/dallni-light.png", dark: "/branding/dallni-dark.png", width: 726, height: 847, alt: "دلّني" },
  icon: { light: "/branding/dallni-icon-light.png", dark: "/branding/dallni-icon-dark.png", width: 710, height: 669, alt: "" },
} as const;

export default function DallniLogo({
  variant = "full",
  className = "h-16 w-auto",
  priority = false,
  sizes,
}: {
  variant?: keyof typeof FILES;
  className?: string; // set the height; width follows the original proportions
  priority?: boolean;
  sizes?: string;
}) {
  const f = FILES[variant];
  // both variants load eagerly (small WebP) so switching theme never shows an empty slot
  const common = { width: f.width, height: f.height, sizes: sizes ?? "160px", draggable: false, ...(priority ? { priority: true } : { loading: "eager" as const }) };
  return (
    <>
      <Image {...common} src={f.light} alt={f.alt} className={`${className} object-contain dark:hidden`} />
      <Image {...common} src={f.dark} alt={f.alt} className={`${className} hidden object-contain dark:block`} />
    </>
  );
}
