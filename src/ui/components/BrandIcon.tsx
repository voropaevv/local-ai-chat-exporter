import { getExtensionAssetUrl } from "../extension-assets";

interface BrandIconProps {
  readonly decorative?: boolean;
}

export function BrandIcon({ decorative = true }: BrandIconProps) {
  return (
    <img
      alt={decorative ? "" : "Jelluvi"}
      aria-hidden={decorative}
      className="brand-mark"
      height="40"
      src={getExtensionAssetUrl("brand/jelluvi.svg")}
      width="40"
    />
  );
}
