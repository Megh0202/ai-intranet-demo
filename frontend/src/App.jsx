import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const TICKETING_UI_BASE_URL = (import.meta.env.VITE_TICKETING_UI_BASE_URL || 'http://127.0.0.1:5174').replace(/\/+$/, '')

function getClientId() {
  const key = 'intranet_chat_client_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const created = (globalThis.crypto?.randomUUID?.() || `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  localStorage.setItem(key, created)
  return created
}

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': getClientId(),
      ...(options?.headers || {}),
    },
    ...options,
  })

  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await res.json() : await res.text()

  if (!res.ok) {
    const message = typeof payload === 'string' ? payload : payload?.detail || 'Request failed'
    throw new Error(message)
  }

  return payload
}

function formatTitle(title) {
  const t = (title || '').trim()
  return t.length ? t : 'New chat'
}

function formatPercent(val) {
  if (val === null || val === undefined) return '0%'
  const v = Number(val)
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%'
}
const CHART_COLORS = ['#60a5fa', '#22c55e', '#f59e0b', '#f97316', '#a855f7', '#14b8a6', '#ef4444']

function buildLinePath(data, width = 320, height = 120, pad = 12) {
  if (!data || data.length === 0) return { line: '', area: '' }
  const maxVal = Math.max(...data.map((d) => d.questions || 0), 1)
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = pad + step * i
    const y = height - pad - ((d.questions || 0) / maxVal) * (height - pad * 2)
    return [x, y]
  })
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  const area = `${line} L ${points[points.length - 1][0]} ${height - pad} L ${points[0][0]} ${height - pad} Z`
  return { line, area }
}

function buildPieSegments(topics) {
  const total = (topics || []).reduce((sum, t) => sum + (t.count || 0), 0)
  let offset = 0
  return (topics || []).map((t, i) => {
    const pct = total ? (t.count / total) * 100 : 0
    const seg = {
      label: t.topic,
      count: t.count || 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
      dashArray: `${pct} ${100 - pct}`,
      dashOffset: 25 - offset,
      pct,
    }
    offset += pct
    return seg
  })
}



function Sources({ sources, messageId }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="sources">
      <div className="sourcesLabel">Sources</div>
      <div className="sourcesChips">
        {sources.map((s) => (
          <a
            className="chipLink"
            key={s}
            href={`${API_BASE}/chat/messages/${messageId}/sources/${encodeURIComponent(s)}`}
            target="_blank"
            rel="noreferrer"
          >
            {s}
          </a>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ msg, onFeedback, onCreateTicket, ticketState }) {
  const isUser = msg.role === 'user'
  const isPending = !isUser && (msg.pending || String(msg.id || '').startsWith('temp-') || msg.content === '…')
  const canFeedback = !isPending && !isUser && msg.role === 'assistant' && typeof onFeedback === 'function'
  const currentFeedback = msg.feedback || 'none'
  const feedbackLocked = currentFeedback !== 'none'

  const persistedTicket = msg.ticket || null

  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketDetails, setTicketDetails] = useState('')

  function openTicketingUi(ticketId) {
    const url = ticketId ? `${TICKETING_UI_BASE_URL}/ticket/${encodeURIComponent(ticketId)}` : TICKETING_UI_BASE_URL
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={isUser ? 'msgRow user' : 'msgRow assistant'}>
      <div className={isUser ? 'bubble bubbleUser' : 'bubble bubbleAssistant'}>
        <div className="msgText">
          {isPending ? (
            <div className="typing">
              <span></span><span></span><span></span>
            </div>
          ) : (
            msg.content
          )}
        </div>

        {!isPending && !isUser && (msg.department || msg.error || msg.confidence !== null && msg.confidence !== undefined) && (
          <div className="meta">
            {msg.department && <span className="pill">{msg.department}</span>}
            {typeof msg.confidence === 'number' && !Number.isNaN(msg.confidence) && (
              <span className="pill">Confidence {Math.round(msg.confidence * 1000) / 10}%</span>
            )}
            {msg.error && <span className="pill pillError">Error</span>}
          </div>
        )}

        {!isPending && !isUser && <Sources sources={msg.sources} messageId={msg.id} />}

        {!isPending && !isUser && !msg.error && typeof onCreateTicket === 'function' && (
          <div className="ticketRow">
            {ticketState?.status === 'creating' && <span className="muted">Creating ticket…</span>}
            {ticketState?.status === 'created' && (
              <div className="ticketCreated">
                <span className="muted">Ticket created</span>
                <button className="btnSm" onClick={() => openTicketingUi(ticketState.resp?.ticket?.json?.ticket?.id || ticketState.resp?.ticket?.id)}>View</button>
              </div>
            )}
            {!ticketState && !!persistedTicket && (
              <div className="ticketCreated">
                <span className="muted">Ticket created</span>
                <button className="btnSm" onClick={() => openTicketingUi(persistedTicket.id)}>View</button>
              </div>
            )}
            {!ticketState && !persistedTicket && !ticketOpen && (
              <button className="btnSm ghost" onClick={() => setTicketOpen(true)}>Create Ticket</button>
            )}
            {ticketOpen && !ticketState && (
              <div className="ticketForm">
                <textarea
                  className="ticketText"
                  placeholder="Extra info for the ticket..."
                  value={ticketDetails}
                  onChange={e => setTicketDetails(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btnSm" onClick={() => { onCreateTicket(msg.id, { details: ticketDetails }); setTicketOpen(false); }}>Submit</button>
                  <button className="btnSm ghost" onClick={() => setTicketOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {canFeedback && !feedbackLocked && (
          <div className="msgActions">
            <button className="iconBtn" onClick={() => onFeedback(msg.id, 'up')} title="Thumbs up">👍</button>
            <button className="iconBtn" onClick={() => onFeedback(msg.id, 'down')} title="Thumbs down">👎</button>
          </div>
        )}

        {canFeedback && feedbackLocked && (
          <div className="msgActions">
            <span className="muted">Rated {currentFeedback === 'up' ? '👍' : '👎'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Dashboard({ stats }) {
  if (!stats) return <div className="dashboard"><div className="muted">Loading analytics...</div></div>

  const {
    summary,
    top_questions,
    top_users,
    top_topics,
    top_sources,
    daily_questions,
    confidence_points,
    recommendations,
  } = stats

  const { line, area } = buildLinePath(daily_questions)
  const pieSegments = buildPieSegments(top_topics)
  const maxSourceCount = Math.max(...(top_sources?.map((s) => s.count) || [1]))
  const maxUserCount = Math.max(...(top_users?.map((u) => u.question_count) || [1]))
  const feedbackTotal = (summary.feedback_up || 0) + (summary.feedback_down || 0)
  const feedbackUpPct = feedbackTotal ? (summary.feedback_up / feedbackTotal) * 100 : 0

  return (
    <div className="dashboard">
      <div className="statsGrid">
        <div className="statCard">
          <div className="statLabel">Total Questions</div>
          <div className="statValue">{summary.total_questions}</div>
          <div className="statSub">Trend {formatPercent(summary.question_trend_pct)}</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Total Messages</div>
          <div className="statValue">{summary.total_messages}</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Active Users</div>
          <div className="statValue">{summary.total_users}</div>
          <div className="statSub">Avg {summary.avg_questions_per_user.toFixed(1)} questions/user</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Assistant Error Rate</div>
          <div className="statValue">{formatPercent(summary.assistant_error_rate * 100)}</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Feedback (up/down)</div>
          <div className="statValue">{summary.feedback_up} / {summary.feedback_down}</div>
        </div>
      </div>

      <div className="dashRow">
        <div className="dashCard wide">
          <div className="cardTitle">Daily Questions (Line Chart)</div>
          <div className="lineWrap">
            <svg className="lineChart" viewBox="0 0 320 120" role="img">
              <path className="lineArea" d={area} />
              <path className="linePath" d={line} />
            </svg>
            {(!daily_questions || daily_questions.length === 0) && <div className="muted">No data yet</div>}
          </div>
        </div>

        <div className="dashCard">
          <div className="cardTitle">Topic Distribution (Pie)</div>
          <div className="pieWrap">
            <svg className="pie" viewBox="0 0 42 42" aria-hidden="true">
              <circle className="pieBg" cx="21" cy="21" r="15.915" />
              {pieSegments.map((seg) => (
                <circle
                  key={seg.label}
                  className="pieSeg"
                  cx="21"
                  cy="21"
                  r="15.915"
                  stroke={seg.color}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                />
              ))}
            </svg>
            <div className="pieLegend">
              {pieSegments.map((seg) => (
                <div key={seg.label} className="legendItem">
                  <span className="legendSwatch" style={{ background: seg.color }} />
                  <span>{seg.label} ({seg.count})</span>
                </div>
              ))}
              {(!top_topics || top_topics.length === 0) && <div className="muted">No data yet</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="dashRow">
        <div className="dashCard">
          <div className="cardTitle">Confidence by Response (Scatter)</div>
          <div className="scatterWrap">
            <svg className="scatterChart" viewBox="0 0 320 160" role="img">
              <line className="scatterAxis" x1="24" y1="12" x2="24" y2="140" />
              <line className="scatterAxis" x1="24" y1="140" x2="304" y2="140" />
              {(confidence_points || []).map((p, i) => {
                const x = 24 + (i / Math.max((confidence_points.length - 1), 1)) * 280
                const y = 140 - (Math.max(0, Math.min(1, p.confidence || 0)) * 120)
                const pct = Math.round((p.confidence || 0) * 1000) / 10
                return (
                  <g key={`${p.response_id || i}-${i}`}>
                    <circle className="scatterDot" cx={x} cy={y} r={4}>
                      <title>{pct}%</title>
                    </circle>
                    <circle className="scatterHit" cx={x} cy={y} r={8}>
                      <title>{pct}%</title>
                    </circle>
                  </g>
                )
              })}
            </svg>
            {(!confidence_points || confidence_points.length === 0) && <div className="muted">No confidence data yet</div>}
          </div>
        </div>

        <div className="dashCard">
          <div className="cardTitle">Top Questions</div>
          <div className="list">
            {top_questions?.map((q) => (
              <div key={q.question} className="listItem">
                <div className="itemMain">
                  <div className="itemLabel">{q.question}</div>
                  <div className="itemSub">Asked {q.count} times</div>
                </div>
                <div className="itemValue">{q.count}</div>
              </div>
            ))}
            {(!top_questions || top_questions.length === 0) && <div className="muted">No data yet</div>}
          </div>
        </div>
      </div>

      <div className="dashRow">
        <div className="dashCard">
          <div className="cardTitle">Frequent Users</div>
          <div className="list">
            {top_users?.map((u) => (
              <div key={u.client_id} className="listItem">
                <div className="itemMain">
                  <div className="itemLabel">{u.display_name || u.client_id}</div>
                  <div className="itemSub">{u.question_count} questions</div>
                </div>
                <div className="itemValue">{u.question_count}</div>
              </div>
            ))}
            {(!top_users || top_users.length === 0) && <div className="muted">No data yet</div>}
          </div>
        </div>
      
        <div className="dashCard">
          <div className="cardTitle">Top Sources (Bar)</div>
          <div className="barChart">
            {top_sources?.map((s) => (
              <div key={s.source} className="barRow">
                <div className="barLabelWrap">
                  <span>{s.source}</span>
                  <span>{s.count}</span>
                </div>
                <div className="barBg">
                  <div className="barFill" style={{ width: `${(s.count / maxSourceCount) * 100}%` }} />
                </div>
              </div>
            ))}
            {(!top_sources || top_sources.length === 0) && <div className="muted">No data yet</div>}
          </div>
        </div>
      </div>

      <div className="dashRow">
        <div className="dashCard">
          <div className="cardTitle">Top Users (Bar)</div>
          <div className="barChart">
            {top_users?.map((u) => (
              <div key={u.client_id} className="barRow">
                <div className="barLabelWrap">
                  <span>{u.display_name || u.client_id}</span>
                  <span>{u.question_count}</span>
                </div>
                <div className="barBg">
                  <div className="barFill" style={{ width: `${(u.question_count / maxUserCount) * 100}%` }} />
                </div>
              </div>
            ))}
            {(!top_users || top_users.length === 0) && <div className="muted">No data yet</div>}
          </div>
        </div>

        <div className="dashCard">
          <div className="cardTitle">Feedback Split</div>
          <div className="feedbackBar">
            <div className="feedbackUp" style={{ width: `${feedbackUpPct}%` }} />
            <div className="feedbackDown" style={{ width: `${100 - feedbackUpPct}%` }} />
          </div>
          <div className="feedbackLabels">
            <span>Up {summary.feedback_up}</span>
            <span>Down {summary.feedback_down}</span>
          </div>
          {feedbackTotal === 0 && <div className="muted">No feedback yet</div>}
        </div>
      </div>

      <div className="dashRow">
        <div className="dashCard predictionCard">
          <div className="cardTitle">Insights and Recommendations</div>
          <div className="list">
            {recommendations?.map((r) => (
              <div key={r.title} className="recItem">
                <div className="recHeader">
                  <span className={`pill ${r.priority === 'high' ? 'pillError' : ''}`} style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    {r.priority}
                  </span>
                  <strong>{r.title}</strong>
                </div>
                <div className="predictionText">{r.detail}</div>
              </div>
            ))}
            {(!recommendations || recommendations.length === 0) && (
              <div className="predictionText">
                The system is stable. Keep monitoring usage and add targeted documentation as new themes appear.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState('chat')

  const [analytics, setAnalytics] = useState(null)
  const [analyticsDays, setAnalyticsDays] = useState(30)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)
  const [localTitles, setLocalTitles] = useState({})

  const [ticketByMessageId, setTicketByMessageId] = useState({})
  const [profile, setProfile] = useState(null)

  const listRef = useRef(null)

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  )

  async function refreshConversations({ autoSelect = true } = {}) {
    setLoadingConversations(true)
    try {
      const items = await apiFetch('/chat/conversations')
      setLocalTitles(prev => {
        const next = { ...prev }
        items.forEach((c) => {
          if (c.title && c.title.trim()) next[c.id] = c.title
        })
        return next
      })
      setConversations(items)
      if (autoSelect && items.length > 0) setActiveConversationId(activeConversationId || items[0].id)
    } catch (e) { setError(e.message) }
    finally { setLoadingConversations(false) }
  }

  async function refreshMessages(conversationId) {
    if (!conversationId) return
    setLoadingMessages(true)
    setError(null)
    try {
      const items = await apiFetch(`/chat/conversations/${conversationId}/messages`)
      setMessages(items)
      queueMicrotask(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    } catch (e) { setError(e.message) }
    finally { setLoadingMessages(false) }
  }

  async function refreshAnalytics() {
    setLoadingAnalytics(true)
    setAnalyticsError(null)
    try {
      const data = await apiFetch(`/chat/analytics?days=${analyticsDays}&limit=10`)
      setAnalytics(data)
    } catch (e) {
      console.error('Analytics failed', e)
      setAnalyticsError(e.message)
    }
    finally { setLoadingAnalytics(false) }
  }

  useEffect(() => {
    if (view === 'dashboard') refreshAnalytics()
  }, [view, analyticsDays])

  async function createConversation() {
    try {
      const created = await apiFetch('/chat/conversations', { method: 'POST', body: JSON.stringify({ title: null }) })
      setConversations((prev) => [created, ...prev])
      setActiveConversationId(created.id)
      setMessages([])
      setView('chat')
      setError(null)
    } catch (e) { setError(e.message) }
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return

    setSending(true)
    setError(null)

    // Track matching pairs to remove them once real data arrives
    const tempId = 'temp-' + Date.now()
    const tempUserMsg = { id: 'u-' + tempId, role: 'user', content: text }
    const tempAssistMsg = { id: 'a-' + tempId, role: 'assistant', content: '…', pending: true }

    setMessages(prev => [...prev, tempUserMsg, tempAssistMsg])
    setDraft('')
    queueMicrotask(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })

    let conversationId = activeConversationId
    try {
      if (!conversationId) {
        const created = await apiFetch('/chat/conversations', { method: 'POST', body: JSON.stringify({ title: null }) })
        setConversations(prev => [created, ...prev])
        setActiveConversationId(created.id)
        conversationId = created.id
      }

      // Optimistically set the title from the first user message if missing.
      const nextTitle = text.length > 60 ? `${text.slice(0, 60)}…` : text
      setLocalTitles(prev => ({ ...prev, [conversationId]: nextTitle }))
      setConversations(prev =>
        prev.map(c => (c.id === conversationId && (!c.title || !c.title.trim()))
          ? { ...c, title: nextTitle }
          : c
        )
      )

      const resp = await apiFetch(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text })
      })

      setMessages(prev => {
        const filtered = prev.filter(m => !String(m.id).includes(tempId))
        return [...filtered, resp.user_message, resp.assistant_message]
      })

      await refreshConversations({ autoSelect: false })
      queueMicrotask(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    } catch (e) {
      console.error('Send failed', e)
      setError(`Failed to send: ${e.message}`)
      // Keep user message but remove typing dots
      setMessages(prev => prev.filter(m => m.id !== tempAssistMsg.id))
    } finally {
      setSending(false)
    }
  }

  async function setFeedback(messageId, feedback) {
    try {
      const updated = await apiFetch(`/chat/messages/${messageId}/feedback`, { method: 'POST', body: JSON.stringify({ feedback }) })
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback: updated.feedback } : m))
    } catch (e) { setError(e.message) }
  }

  async function createTicketForMessage(messageId, payload) {
    setTicketByMessageId(prev => ({ ...prev, [messageId]: { status: 'creating' } }))
    try {
      const resp = await apiFetch(`/chat/messages/${messageId}/ticket`, { method: 'POST', body: JSON.stringify(payload) })
      setTicketByMessageId(prev => ({ ...prev, [messageId]: { status: 'created', resp } }))
    } catch (e) {
      setTicketByMessageId(prev => ({ ...prev, [messageId]: { status: 'error', error: e.message } }))
    }
  }

  useEffect(() => {
    (async () => {
      setLoadingConversations(true)
      try {
        const p = await apiFetch('/chat/profile')
        setProfile(p)
        const items = await apiFetch('/chat/conversations')
        if (items.length === 0) {
          await createConversation()
        } else {
          setConversations(items)
          setActiveConversationId(items[0].id)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoadingConversations(false)
      }
    })()
  }, [])

  useEffect(() => { if (activeConversationId) refreshMessages(activeConversationId) }, [activeConversationId])

  return (
    <div className="bg">
      <div className="shell">
        <aside className="sidebar glass">
          <div className="sideTop">
            <div className="brand">
              <div className="brandMark">AI</div>
              <div className="brandText">
                <div className="brandTitle">Intranet Chat</div>
                <div className="brandSub">
                  {profile?.display_name ? `Hi, ${profile.display_name}` : 'Intranet Assistant'}
                </div>
              </div>
            </div>
            <button className="btn primary" onClick={createConversation}>+ New chat</button>
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button className={view === 'chat' ? 'navBtn active' : 'navBtn'} onClick={() => setView('chat')}>💬 Chat</button>
              <button className={view === 'dashboard' ? 'navBtn active' : 'navBtn'} onClick={() => setView('dashboard')}>📊 Dashboard</button>
            </div>
          </div>
          <div className="sideList">
            {conversations.map(c => (
              <div
                key={c.id}
                className={c.id === activeConversationId ? 'convItemRow active' : 'convItemRow'}
                onClick={() => { setActiveConversationId(c.id); setView('chat'); }}
              >
                <div className="convTitle">{formatTitle(localTitles[c.id] || c.title)}</div>
              </div>
            ))}
          </div>
        </aside>

        <main className="main glass">
          <header className="topbar">
            <div>
              <div className="topTitle">
                {view === 'dashboard'
                  ? 'Analytics Dashboard'
                  : (activeConversation ? formatTitle(localTitles[activeConversation.id] || activeConversation.title) : 'New Chat')}
              </div>
              <div className="topSub">
                {view === 'dashboard' ? `Last ${analyticsDays} days` : 'How can I help you today?'}
              </div>
            </div>
            <div className="rightInfo">
              {view === 'dashboard' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="dashSelect"
                    value={analyticsDays}
                    onChange={(e) => setAnalyticsDays(Number(e.target.value))}
                  >
                    <option value={7}>7 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                  <button className="btnSm" onClick={refreshAnalytics}>Refresh</button>
                </div>
              )}
            </div>
          </header>

          {view === 'dashboard' ? (
            <section className="dashboardWrap">
              {loadingAnalytics && <div className="muted">Loading analytics...</div>}
              {analyticsError && <div className="error">{analyticsError}</div>}
              {!loadingAnalytics && !analyticsError && <Dashboard stats={analytics} />}
            </section>
          ) : (
            <>
              <section className="chat" ref={listRef}>
                {error && <div className="error">{error}</div>}
                {messages.length === 0 && !loadingMessages && (
                  <div className="muted" style={{ textAlign: 'center', marginTop: '40px' }}>
                    Welcome to the Intranet Assistant. Ask queries about internal documents.
                  </div>
                )}
                {messages.map(m => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    onFeedback={setFeedback}
                    onCreateTicket={createTicketForMessage}
                    ticketState={ticketByMessageId[m.id]}
                  />
                ))}
              </section>
              <footer className="composerWrap">
                <div className="composer">
                  <textarea
                    className="input"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Ask a question..."
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    disabled={sending}
                  />
                  <button
                    className="btn primary"
                    onClick={send}
                    disabled={!draft.trim() || sending}
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
