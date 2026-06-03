import { getExtensionAssetUrl } from "../extension-assets";

interface BrandIconProps {
  readonly decorative?: boolean;
}

export function BrandIcon({ decorative = true }: BrandIconProps) {
  return (
    <img
      alt={decorative ? "" : "Local AI Chat Exporter"}
      aria-hidden={decorative}
      className="brand-mark"
      height="40"
      src={getExtensionAssetUrl("icons/icon-48.png")}
      width="40"
    />
  );
}
