import Image from "next/image";
export function BrandLogo() {
  return (
    <span className="brand-icon" aria-hidden="true">
      <Image
        src="/brand/mappleo-logo.webp"
        alt=""
        width={40}
        height={40}
        unoptimized
      />
    </span>
  );
}
