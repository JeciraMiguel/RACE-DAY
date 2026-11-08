import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

/** 1-based pages. Shows the first, last and the neighbours of the current page. */
function visiblePages(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) result.push('gap');
    result.push(p);
  });
  return result;
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className={styles.nav} aria-label="Pagination">
      <button type="button" className={styles.page} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
      {visiblePages(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={styles.page}
            onClick={() => onPageChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Page ${item}`}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className={styles.page} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">›</button>
    </nav>
  );
}
