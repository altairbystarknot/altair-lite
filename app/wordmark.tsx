import Link from "next/link";

const STAR = "M12 0Q13.3 10.7 24 12Q13.3 13.3 12 24Q10.7 13.3 0 12Q10.7 10.7 12 0Z";

/** "altair" with the star as the dot of the i, and the "lite" tag. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link className="wm" href={href} aria-label="Altair Lite, home">
      <b aria-hidden="true">alta<span className="i">ı<svg viewBox="0 0 24 24"><path d={STAR} /></svg></span>r</b>
      <small aria-hidden="true">lite</small>
    </Link>
  );
}

export function Star({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill="#dcb872" /></svg>;
}
