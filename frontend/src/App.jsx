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
  const createdTicketId = ticketState?.resp?.ticket?.json?.ticket?.id || null
  const effectiveTicketId = createdTicketId || persistedTicket?.id || null
  const effectiveTicketTitle = ticketState?.resp?.title || persistedTicket?.title || null

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
            <span className="typing">
              <span className="typingDots" aria-label="Generating response" />
            </span>
          ) : (
            msg.content
          )}
        </div>

        {!isPending && !isUser && msg.department && (
          <div className="meta">
            <span className="pill">{msg.department}</span>
            {msg.error && <span className="pill pillError">Error</span>}
          </div>
        )}

        {!isPending && !isUser && <Sources sources={msg.sources} messageId={msg.id} />}

        {!isPending && !isUser && !msg.error && typeof onCreateTicket === 'function' && (
          <div className="ticketRow">
            {ticketState?.status === 'creating' && <span className="muted">Creating ticket…</span>}
            {ticketState?.status === 'created' && (
              <div className="ticketCreated">
                <span className="muted">
                  Ticket created{effectiveTicketTitle ? `: ${effectiveTicketTitle}` : ''}
                  {effectiveTicketId ? ` (#${effectiveTicketId})` : ''}
                </span>
                <button
                  className="btnSm"
                  type="button"
                  onClick={() => openTicketingUi(effectiveTicketId)}
                >
                  View ticket
                </button>
              </div>
            )}
            {ticketState?.status === 'error' && (
              <span className="muted">
                Ticket failed: {ticketState.error}{' '}
                <button
                  className="btnSm"
                  type="button"
                  onClick={() => onCreateTicket(msg.id, ticketState?.draft)}
                >
                  Retry
                </button>
              </span>
            )}

            {!ticketState && !!persistedTicket && (
              <div className="ticketCreated">
                <span className="muted">
                  Ticket created{persistedTicket?.title ? `: ${persistedTicket.title}` : ''}
                  {persistedTicket?.id ? ` (#${persistedTicket.id})` : ''}
                </span>
                <button className="btnSm" type="button" onClick={() => openTicketingUi(persistedTicket?.id || null)}>
                  View ticket
                </button>
              </div>
            )}

            {!ticketState && !persistedTicket && !ticketOpen && (
              <>
                <span className="muted">Create a ticket?</span>
                <button className="btnSm" type="button" onClick={() => setTicketOpen(true)}>
                  Yes
                </button>
              </>
            )}

            {!ticketState && ticketOpen && (
              <form
                className="ticketForm"
                onSubmit={(e) => {
                  e.preventDefault()
                  onCreateTicket(msg.id, { details: ticketDetails })
                }}
              >
                <textarea
                  className="ticketText"
                  value={ticketDetails}
                  onChange={(e) => setTicketDetails(e.target.value)}
                  placeholder="Optional: add extra details for the agent (device, urgency, steps tried, error messages)…"
                  rows={4}
                />
                <div className="ticketActions">
                  <button className="btnSm" type="submit">
                    Create
                  </button>
                  <button
                    className="btnSm ghost"
                    type="button"
                    onClick={() => {
                      setTicketOpen(false)
                      setTicketDetails('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="muted">Title & description will be generated by the agent.</div>
              </form>
            )}
          </div>
        )}

        {canFeedback && !feedbackLocked && (
          <div className="msgActions">
            <button
              className={currentFeedback === 'up' ? 'iconBtn active' : 'iconBtn'}
              onClick={() => {
                onFeedback(msg.id, 'up')
              }}
              title="Thumbs up"
              type="button"
            >
              👍
            </button>
            <button
              className={currentFeedback === 'down' ? 'iconBtn active' : 'iconBtn'}
              onClick={() => {
                onFeedback(msg.id, 'down')
              }}
              title="Thumbs down"
              type="button"
            >
              👎
            </button>
          </div>
        )}

        {canFeedback && feedbackLocked && (
          <div className="msgActions">
            <span className="muted">Rated {currentFeedback === 'up' ? '👍' : currentFeedback === 'down' ? '👎' : ''}</span>
          </div>
        )}
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

  const [ticketByMessageId, setTicketByMessageId] = useState({})

  const [profile, setProfile] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  const listRef = useRef(null)
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  )

  async function refreshConversations({ autoSelect = true } = {}) {
    setLoadingConversations(true)
    setError(null)
    try {
      const items = await apiFetch('/chat/conversations')
      setConversations(items)

      if (autoSelect) {
        const nextId = activeConversationId || items?.[0]?.id || null
        if (nextId) setActiveConversationId(nextId)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingConversations(false)
    }
  }

  async function refreshMessages(conversationId) {
    if (!conversationId) return
    setLoadingMessages(true)
    setError(null)
    try {
      const items = await apiFetch(`/chat/conversations/${conversationId}/messages`)
      setMessages(items)
      queueMicrotask(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function createConversation() {
    setError(null)
    try {
      const created = await apiFetch('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: null }),
      })

      setConversations((prev) => [created, ...prev])
      setActiveConversationId(created.id)
      setMessages([])
      setDraft('')
      setRenamingId(null)
      setRenameDraft('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function createTicketForMessage(messageId, draft) {
    setError(null)
    setTicketByMessageId((prev) => ({ ...prev, [messageId]: { status: 'creating', draft: draft || null } }))
    try {
      const payload = draft && typeof draft === 'object' ? draft : {}
      const resp = await apiFetch(`/chat/messages/${messageId}/ticket`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setTicketByMessageId((prev) => ({ ...prev, [messageId]: { status: 'created', resp } }))

      const ticketId = resp?.ticket?.json?.ticket?.id
      if (typeof ticketId === 'string' && ticketId.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, ticket: { id: ticketId.trim(), title: resp?.title || '', description: resp?.description || '' } }
              : m
          )
        )
      }
    } catch (e) {
      setTicketByMessageId((prev) => ({ ...prev, [messageId]: { status: 'error', error: e.message, draft: draft || prev?.[messageId]?.draft || null } }))
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return

    let conversationId = activeConversationId
    if (!conversationId) {
      const created = await apiFetch('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: null }),
      })
      setConversations((prev) => [created, ...prev])
      setActiveConversationId(created.id)
      setMessages([])
      conversationId = created.id
    }

    setSending(true)
    setError(null)

    const tempUser = {
      id: `temp-u-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    const tempAssistant = {
      id: `temp-a-${Date.now()}`,
      conversation_id: conversationId,
      role: 'assistant',
      content: '…',
      pending: true,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, tempUser, tempAssistant])
    setDraft('')
    queueMicrotask(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })

    try {
      const resp = await apiFetch(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      })

      setMessages((prev) => {
        const trimmed = prev.filter((m) => !String(m.id).startsWith('temp-'))
        return [...trimmed, resp.user_message, resp.assistant_message]
      })
      await refreshConversations({ autoSelect: false })
      queueMicrotask(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      })
    } catch (e) {
      setMessages((prev) => prev.filter((m) => !String(m.id).startsWith('temp-')))
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function renameConversation(conversationId, title) {
    setError(null)
    try {
      const updated = await apiFetch(`/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      })
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteConversation(conversationId) {
    if (!conversationId) return
    setError(null)
    try {
      await apiFetch(`/chat/conversations/${conversationId}`, { method: 'DELETE' })
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== conversationId)

        if (activeConversationId === conversationId) {
          const next = remaining[0]?.id || null
          setActiveConversationId(next)
          setMessages([])
        }

        if (remaining.length === 0) {
          // Recreate a chat automatically so the UI stays usable.
          queueMicrotask(() => createConversation())
        }

        return remaining
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setRenamingId(null)
      setRenameDraft('')
    }
  }

  async function setFeedback(messageId, feedback) {
    setError(null)
    try {
      const updated = await apiFetch(`/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: updated.feedback, feedback_comment: updated.feedback_comment } : m))
      )
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    ;(async () => {
      setLoadingConversations(true)
      setError(null)
      try {
        const p = await apiFetch('/chat/profile')
        setProfile(p)
        setNameDraft(p.display_name || '')

        const items = await apiFetch('/chat/conversations')
        if (!items || items.length === 0) {
          const created = await apiFetch('/chat/conversations', {
            method: 'POST',
            body: JSON.stringify({ title: null }),
          })
          setConversations([created])
          setActiveConversationId(created.id)
          return
        }
        setConversations(items)
        setActiveConversationId(items[0].id)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoadingConversations(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDisplayName(nextName) {
    setError(null)
    try {
      const updated = await apiFetch('/chat/profile', {
        method: 'PUT',
        body: JSON.stringify({ display_name: nextName?.trim() || null }),
      })
      setProfile(updated)
      setNameDraft(updated.display_name || '')
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    refreshMessages(activeConversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId])

  return (
    <div className="bg">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />

      <div className="shell">
        <aside className="sidebar glass">
          <div className="sideTop">
            <div className="brand">
              <div className="brandMark">AI</div>
              <div className="brandText">
                <div className="brandTitle">Intranet Chat</div>
                <div className="brandSub">
                  {editingName ? (
                    <input
                      className="nameInput"
                      value={nameDraft}
                      placeholder="Your name"
                      autoFocus
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveDisplayName(nameDraft)
                          setEditingName(false)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingName(false)
                          setNameDraft(profile?.display_name || '')
                        }
                      }}
                      onBlur={() => {
                        saveDisplayName(nameDraft)
                        setEditingName(false)
                      }}
                    />
                  ) : (
                    <button
                      className="nameBtn"
                      type="button"
                      title="Edit display name"
                      onClick={() => setEditingName(true)}
                    >
                      {profile?.display_name ? `Hi, ${profile.display_name}` : 'RAG over internal docs'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button className="btn" onClick={createConversation} disabled={loadingConversations}>
              + New chat
            </button>
          </div>

          <div className="sideList">
            {loadingConversations && <div className="muted">Loading…</div>}
            {!loadingConversations && conversations.length === 0 && (
              <div className="muted">No conversations yet.</div>
            )}
            {conversations.map((c) => {
              const active = c.id === activeConversationId
              const isRenaming = renamingId === c.id
              return (
                <div key={c.id} className={active ? 'convItemRow active' : 'convItemRow'}>
                  {isRenaming ? (
                    <div className="convMain" title="Rename conversation">
                      <input
                        className="renameInput"
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            renameConversation(c.id, renameDraft.trim() || null)
                            setRenamingId(null)
                            setRenameDraft('')
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setRenamingId(null)
                            setRenameDraft('')
                          }
                        }}
                        onBlur={() => {
                          renameConversation(c.id, renameDraft.trim() || null)
                          setRenamingId(null)
                          setRenameDraft('')
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      className="convMain"
                      onClick={() => setActiveConversationId(c.id)}
                      title={formatTitle(c.title)}
                      type="button"
                    >
                      <div className="convTitle">{formatTitle(c.title)}</div>
                      <div className="convMeta">Updated {new Date(c.updated_at).toLocaleString()}</div>
                    </button>
                  )}

                  <div className="convActions">
                    <button
                      className="iconBtn"
                      title="Rename"
                      type="button"
                      onClick={() => {
                        setRenamingId(c.id)
                        setRenameDraft(c.title || '')
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="iconBtn danger"
                      title="Delete"
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <main className="main glass">
          <header className="topbar">
            <div>
              <div className="topTitle">{activeConversation ? formatTitle(activeConversation.title) : 'Chat'}</div>
              <div className="topSub">Ask questions about HR / IT / Finance documents</div>
            </div>
            <div className="rightInfo">
              <a className="link" href="/" onClick={(e) => e.preventDefault()}>
                API: {API_BASE || 'proxy'}
              </a>
            </div>
          </header>

          <section className="chat" ref={listRef}>
            {loadingMessages && <div className="muted">Loading messages…</div>}
            {!loadingMessages && messages.length === 0 && (
              <div className="empty">
                <div className="emptyTitle">Start a conversation</div>
                <div className="emptySub">Try: “How many casual leaves do employees get?”</div>
              </div>
            )}
            {messages.map((m) => (
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
            {error && <div className="error">{error}</div>}
            <div className="composer">
              <textarea
                className="input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message Intranet Chat…"
                rows={1}
                style={{ height: 'auto' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                disabled={sending}
                onInput={(e) => {
                  e.currentTarget.style.height = 'auto'
                  e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`
                }}
              />
              <button className="btn primary" onClick={send} disabled={!draft.trim() || sending}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            <div className="hint">Enter to send • Shift+Enter for new line</div>
          </footer>
        </main>
      </div>
    </div>
  )
}
