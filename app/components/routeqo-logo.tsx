import Image from "next/image";

export function RouteqoLogo({ size = 36 }: { size?: number }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="routeqo-logo"
      height={size}
      src="/icon_routeqo.svg"
      width={size}
    />
  );
}
