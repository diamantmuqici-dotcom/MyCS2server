import { Link } from 'react-router-dom';

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="Dardania | Elite home">
      <img src={asset('brand/emblem-512.png')} alt="" width={44} height={44} />
      {!compact && (
        <span className="brand-word">
          <strong>
            DARDANIA <span aria-hidden="true">|</span> ELITE
          </strong>
          <span>Counter-Strike 2</span>
        </span>
      )}
    </Link>
  );
}
