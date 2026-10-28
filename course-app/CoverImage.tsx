// Course cover from the Cloudflare R2 media bucket: 800px for small screens, 1600px for large ones.
const COVER_PREFIX = 'https://media.armatureailabs.com/covers/';
export function CoverImage({ url, className, sizes, eager = false }: { url?: string | null; className: string; sizes: string; eager?: boolean }) {
  if (!url || !url.startsWith(COVER_PREFIX) || !url.endsWith('-1600.webp')) return null;
  const small = url.replace(/-1600\.webp$/, '-800.webp');
  return <img className={className} src={small} srcSet={`${small} 800w, ${url} 1600w`} sizes={sizes} width={1600} height={900} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}
