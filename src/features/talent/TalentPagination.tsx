import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function TalentPagination({ page, pages, pageSize, loading, total, onChange }: { page: number; pages: number; pageSize: number; loading: boolean; total: number; onChange: (page: number) => void }) {
  const [limit, setLimit] = useState(5);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 379px)');
    const update = () => setLimit(narrow.matches ? 4 : 5);
    update(); narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, []);
  const size = Math.min(limit, pages);
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), pages - size + 1));
  return <div className="talent-page-footer" hidden={!total}>
    <p>{pageSize} profiles per page · <span>Page {page} of {pages}</span></p>
    <nav className="pagination talent-pagination" aria-label="Results pages">
      <div className="talent-page-window" role="group" aria-label="Choose a results page">
        {Array.from({ length: size }, (_, index) => start + index).map(number => <button key={number} type="button" disabled={loading} aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => onChange(number)}>{number}</button>)}
      </div>
      <button type="button" className="talent-next-page" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}>Next <ChevronRight size={13} aria-hidden="true"/></button>
    </nav>
  </div>;
}
