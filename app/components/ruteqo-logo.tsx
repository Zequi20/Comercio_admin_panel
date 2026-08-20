import Image from "next/image";

export function RuteqoLogo({ size = 26 }: { size?: number }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="ruteqo-logo"
      height={size}
      src="/icon_ruteqo.svg"
      width={size}
    />
  );
}
