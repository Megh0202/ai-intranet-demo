import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import './App.css';

const API_BASE = import.meta.env.VITE_TICKET_API_BASE_URL || 'http://127.0.0.1:5000';

function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function run() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE}/ticket/view/${encodeURIComponent(id)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || `Failed to load ticket (${response.status})`)
        }
        if (mounted) setTicket(payload)
      } catch (err) {
        console.error('Error loading ticket:', err)
        if (mounted) setError(err?.message || 'Failed to load ticket')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [id])

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1 className="title">Ticket</h1>
          <p className="subtitle">
            <button className="linkBtn" type="button" onClick={() => navigate(-1)}>
              ← Back
            </button>
            <span className="mono"> #{id}</span>
          </p>
        </div>
        <Link className="btn" to="/">All tickets</Link>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {loading ? (
        <div className="loading">Loading ticket…</div>
      ) : ticket ? (
        <div className="panel">
          <h2 className="panelTitle">Details</h2>
          <div className="detailGrid">
            <div className="detailRow">
              <div className="detailLabel">Title</div>
              <div className="detailValue">{ticket.title}</div>
            </div>
            <div className="detailRow">
              <div className="detailLabel">Status</div>
              <div className="detailValue">
                <span className={`pill ${ticket.status === 'open' ? 'open' : ticket.status === 'closed' ? 'closed' : 'progress'}`}>
                  {ticket.status || 'open'}
                </span>
              </div>
            </div>
            <div className="detailRow">
              <div className="detailLabel">Created</div>
              <div className="detailValue">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : '—'}</div>
            </div>
            <div className="detailRow">
              <div className="detailLabel">Updated</div>
              <div className="detailValue">{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : '—'}</div>
            </div>
          </div>

          <div className="detailBlock">
            <div className="detailLabel">Description</div>
            <pre className="detailPre">{ticket.description || ''}</pre>
          </div>
        </div>
      ) : (
        <div className="empty">Ticket not found.</div>
      )}
    </div>
  )
}

function TicketListPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    refreshTickets();
  }, []);

  async function refreshTickets() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/ticket/view`);
      if (!response.ok) {
        throw new Error(`Failed to load tickets (${response.status})`);
      }
      const data = await response.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError(err?.message || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_BASE}/ticket/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, description: trimmedDescription }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to create ticket (${response.status})`);
      }

      const created = payload?.ticket;
      if (created?.id) {
        setTickets((prev) => [created, ...prev]);
      } else {
        await refreshTickets();
      }

      setTitle('');
      setDescription('');

      if (created?.id) {
        navigate(`/ticket/${encodeURIComponent(created.id)}`);
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError(err?.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(ticketId) {
    setError('');
    setDeletingId(ticketId);
    try {
      const response = await fetch(`${API_BASE}/ticket/delete/${ticketId}`, {
        method: 'DELETE',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to delete ticket (${response.status})`);
      }

      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    } catch (err) {
      console.error('Error deleting ticket:', err);
      setError(err?.message || 'Failed to delete ticket');
    } finally {
      setDeletingId(null);
    }
  }

  const ticketCount = useMemo(() => tickets?.length || 0, [tickets])

  return (
    <>
      <div className="page">
        <header className="header">
          <div>
            <h1 className="title">Ticket System</h1>
            <p className="subtitle">{ticketCount} tickets</p>
          </div>
          <button className="btn" onClick={refreshTickets} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error ? <div className="alert">{error}</div> : null}

        <div className="grid">
          <section className="panel">
            <h2 className="panelTitle">Create ticket</h2>
            <form onSubmit={onCreate} className="form">
              <label className="label">
                Title
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. VPN not working"
                  maxLength={200}
                />
              </label>
              <label className="label">
                Description
                <textarea
                  className="textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add steps to reproduce, device, screenshots…"
                  rows={5}
                  maxLength={5000}
                />
              </label>
              <button className="btn primary" type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <div className="meta">API: {API_BASE}</div>
            </form>
          </section>

          <section className="panel">
            <h2 className="panelTitle">Tickets</h2>

            {loading ? (
              <div className="loading">Loading tickets…</div>
            ) : tickets?.length > 0 ? (
              <div className="list">
                {tickets.map((t) => (
                  <div className="ticket" key={t.id}>
                    <div className="ticketTop">
                      <div>
                        <Link className="ticketTitleLink" to={`/ticket/${encodeURIComponent(t.id)}`}>
                          <div className="ticketTitle">{t.title}</div>
                        </Link>
                        <div className="ticketMeta">
                          <span className={`pill ${t.status === 'open' ? 'open' : t.status === 'closed' ? 'closed' : 'progress'}`}>
                            {t.status || 'open'}
                          </span>
                          <span className="mono">#{t.id}</span>
                          {t.createdAt ? <span>{new Date(t.createdAt).toLocaleString()}</span> : null}
                        </div>
                      </div>
                      <div className="ticketBtns">
                        <Link className="btn" to={`/ticket/${encodeURIComponent(t.id)}`}>View</Link>
                        <button
                          className="btn danger"
                          onClick={() => onDelete(t.id)}
                          disabled={deletingId === t.id}
                          title="Delete ticket"
                        >
                          {deletingId === t.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    {t.description ? <div className="ticketDesc">{t.description}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No tickets found.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TicketListPage />} />
      <Route path="/ticket/:id" element={<TicketDetailPage />} />
    </Routes>
  )
}
