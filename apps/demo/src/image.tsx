import type { ImgHTMLAttributes } from "react";
const logo = new URL("../../../public/brand/mappleo-logo.webp", import.meta.url)
  .href;
// The web brand's exact asset, without Next's server-side image endpoint.
export default function Image({
  src,
  unoptimized,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  void src;
  void unoptimized;
  return <img {...props} src={logo} alt={props.alt ?? ""} />;
}
