import { useState } from 'react';
import { Ambient } from '../components/Ambient';
import { clearAdminKey, getAdminKey, setAdminKey } from './adminApi';
import { AdminDashboard } from './AdminDashboard';
import { AdminRoster } from './AdminRoster';
import { AdminStudent } from './AdminStudent';
import '../screens/screens.css';
import './admin.css';

type View = { name: 'dashboard' } | { name: 'roster' } | { name: 'student'; id: string };

/**
 * Placement-office view, mounted at /admin. Read-focused: are students
 * practicing, and are they getting interview-ready? Framing stays
 * developmental — progress, never rankings.
 */
export function AdminApp() {
  const [unlocked, setUnlocked] = useState(getAdminKey() !== '');
  const [keyInput, setKeyInput] = useState('');
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [authError, setAuthError] = useState('');

  function onUnauthorized() {
    clearAdminKey();
    setUnlocked(false);
    setAuthError('That key was not accepted — check ADMIN_KEY on the server.');
  }

  if (!unlocked) {
    return (
      <>
        <Ambient />
        <main className="screen enter" style={{ maxWidth: 560 }}>
          <p className="screen-kicker">Placement office</p>
          <h1>Progress dashboard</h1>
          <span className="beam" aria-hidden="true" />
          <p className="screen-sub">
            Enter the admin key to see how your students are practicing. Read-only — nothing
            here changes a student's data.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%' }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              type="password"
              placeholder="Admin key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && keyInput.trim()) {
                  setAdminKey(keyInput.trim());
                  setUnlocked(true);
                }
              }}
            />
            <button
              className="btn btn-primary"
              disabled={!keyInput.trim()}
              onClick={() => {
                setAdminKey(keyInput.trim());
                setUnlocked(true);
              }}
            >
              Open
            </button>
          </div>
          {authError && <p className="error-note" style={{ marginTop: 'var(--space-3)' }}>{authError}</p>}
        </main>
      </>
    );
  }

  return (
    <>
      <Ambient />
      <main className="screen enter admin">
        <nav className="admin-nav">
          <p className="screen-kicker" style={{ margin: 0 }}>
            Placement office
          </p>
          <span style={{ flex: 1 }} />
          <button
            className={`btn btn-quiet ${view.name === 'dashboard' ? 'admin-tab-active' : ''}`}
            onClick={() => setView({ name: 'dashboard' })}
          >
            Dashboard
          </button>
          <button
            className={`btn btn-quiet ${view.name !== 'dashboard' ? 'admin-tab-active' : ''}`}
            onClick={() => setView({ name: 'roster' })}
          >
            Students
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => {
              clearAdminKey();
              setUnlocked(false);
            }}
          >
            Lock
          </button>
        </nav>

        {view.name === 'dashboard' && <AdminDashboard onUnauthorized={onUnauthorized} />}
        {view.name === 'roster' && (
          <AdminRoster
            onUnauthorized={onUnauthorized}
            onOpenStudent={(id) => setView({ name: 'student', id })}
          />
        )}
        {view.name === 'student' && (
          <AdminStudent
            id={view.id}
            onBack={() => setView({ name: 'roster' })}
            onUnauthorized={onUnauthorized}
          />
        )}
      </main>
    </>
  );
}
