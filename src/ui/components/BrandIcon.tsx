import { getExtensionAssetUrl } from "../extension-assets";

interface BrandIconProps {
  readonly decorative?: boolean;
}

export function BrandIcon({ decorative = true }: BrandIconProps) {
  return (
    <img
      alt={decorative ? "" : "AI Chat Export"}
      aria-hidden={decorative}
      className="brand-mark"
      height="40"
      src={getExtensionAssetUrl("brand/icon.svg")}
      width="40"
    />
  );
}
