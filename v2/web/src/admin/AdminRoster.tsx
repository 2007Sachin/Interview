import { useEffect, useMemo, useState } from 'react';
import { fetchRoster, rosterToCsv, type RosterRow } from './adminApi';

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

interface Props {
  onUnauthorized: () => void;
  onOpenStudent: (id: string) => void;
}

export function AdminRoster({ onUnauthorized, onOpenStudent }: Props) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [q, setQ] = useState('');
  const [batch, setBatch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Server filters too, but fetching once and filtering client-side keeps
    // typing snappy at v1 scale.
    void fetchRoster('', '')
      .then((d) => !cancelled && setRows(d.roster))
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message === 'unauthorized') onUnauthorized();
        else setError('Could not load the roster — refresh to retry.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const batches = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.batch).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!term || r.name.toLowerCase().includes(term) || r.handle.toLowerCase().includes(term)) &&
        (!batch || r.batch === batch),
    );
  }, [rows, q, batch]);

  function exportCsv() {
    const blob = new Blob([rosterToCsv(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-progress-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-grid">
      <h1>Student progress</h1>
      <span className="beam" aria-hidden="true" />

      <div className="admin-toolbar">
        <input
          className="field-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search name or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="field-input" value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV
        </button>
      </div>

      {error && <p className="error-note">{error}</p>}
      {rows === null && !error && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <div className="skeleton" style={{ width: '80%' }} />
          <div className="skeleton" style={{ width: '70%' }} />
        </div>
      )}
      {rows !== null && filtered.length === 0 && (
        <p className="stat-sub">No students match — clear the search or wait for signups.</p>
      )}

      <div className="roster">
        {filtered.map((r) => (
          <button key={r.id} className="roster-row" onClick={() => onOpenStudent(r.id)}>
            <span className="roster-name">
              {r.name || r.handle}
              <em>{r.batch || r.institution}</em>
            </span>
            <span className="roster-cell">{r.interviews} interview{r.interviews === 1 ? '' : 's'}</span>
            <span className="roster-cell">
              {r.latestReadiness ?? '—'}
              {r.latestScore !== null && ` · ${Math.round(r.latestScore)}`}
            </span>
            <span
              className="roster-cell"
              aria-label={r.trend === 1 ? 'rising' : r.trend === -1 ? 'dipping' : 'steady'}
              style={{ color: r.trend === 1 ? 'var(--aurora-teal)' : 'var(--text-muted)' }}
            >
              {r.trend === 1 ? '↗' : r.trend === -1 ? '↘' : '→'}
            </span>
            <span className="roster-cell">
              {r.lastActive ? DATE_FMT.format(new Date(r.lastActive)) : 'never'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
