import React, { useState, useEffect, useRef } from "react";

const Query: React.FC = () => {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"echo" | "nl">("nl");
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [sql, setSql] = useState<string | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [rawJson, setRawJson] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<string | null>(null); // echo mode response
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<
    {
      id: number;
      ts: number;
      mode: "echo" | "nl";
      query: string;
      sql?: string | null;
      rowsCount?: number | null;
      error?: string | null;
    }[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(
    null
  );
  // Autocomplete state
  const staticSamples = React.useMemo(
    () => [
      "count users",
      "average age",
      "sum balance in last 24 hours",
      "sum balance in last 30 hours",
      "list active users",
      "count users by country",
      "name starts with A",
      "users from US",
      "average balance by subscription plan",
      "sum total balance last 7 days",
    ],
    []
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const suggestBoxRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const maxHistory = 25;

  const resetBeforeRun = () => {
    setLastQuery(null);
    setError(null);
    setResponse(null);
    setSql(null);
    setRows(null);
    setWarning(null);
    setRawJson(null);
  };

  const performQuery = async (q: string, m: "echo" | "nl") => {
    const current = q.trim();
    if (!current) return;
    resetBeforeRun();
    setSubmitting(true);
    try {
      if (m === "echo") {
        const res = await fetch("http://localhost:8000/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: current }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResponse(data.received);
        setRawJson(data);
        setLastQuery(current);
        setHistory((h) => {
          const next = [
            {
              id: Date.now(),
              ts: Date.now(),
              mode: m,
              query: current,
              sql: null,
              rowsCount: null,
              error: null,
            },
            ...h,
          ];
          return next.slice(0, maxHistory);
        });
      } else {
        const res = await fetch("http://localhost:8000/nl-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: current }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setSql(data.sql);
        setRows(data.rows || []);
        if (data.warning) setWarning(data.warning);
        setRawJson(data);
        setLastQuery(current);
        setHistory((h) => {
          const next = [
            {
              id: Date.now(),
              ts: Date.now(),
              mode: m,
              query: current,
              sql: data.sql,
              rowsCount: Array.isArray(data.rows) ? data.rows.length : null,
              error: null,
            },
            ...h,
          ];
          return next.slice(0, maxHistory);
        });
      }
    } catch (err: any) {
      setError(err.message || "Unknown error");
      setHistory((h) =>
        [
          {
            id: Date.now(),
            ts: Date.now(),
            mode: m,
            query: current,
            sql: null,
            rowsCount: null,
            error: err.message || "Unknown error",
          },
          ...h,
        ].slice(0, maxHistory)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    performQuery(text, mode);
  };

  return (
    <div
      className="page-content"
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(60vh)",
          padding: "2rem 1rem 0.5rem",
          width: "100%",
        }}
      >
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            alignItems: "flex-end",
            width: "48vw",
            maxWidth: 680,
            minWidth: 420,
            gap: "0.75rem",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -34,
              left: 2,
              display: "flex",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={() => setMode("nl")}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 6,
                fontSize: ".75rem",
                border: mode === "nl" ? "1px solid #4c63d2" : "1px solid #ccc",
                background: mode === "nl" ? "#eef1fd" : "#f8f8f8",
                cursor: "pointer",
              }}
            >
              CFG NL→SQL
            </button>
            <button
              type="button"
              onClick={() => setMode("echo")}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 6,
                fontSize: ".75rem",
                border:
                  mode === "echo" ? "1px solid #4c63d2" : "1px solid #ccc",
                background: mode === "echo" ? "#eef1fd" : "#f8f8f8",
                cursor: "pointer",
              }}
            >
              Echo
            </button>
          </div>
          <div style={{ flex: 1, display: "flex" }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                if (submitting && mode === "nl") return; // ignore edits while translating
                const v = e.target.value;
                setText(v);
                setHighlightIndex(-1);
                // Build candidate set: unique static samples + recent history queries
                const lower = v.toLowerCase();
                if (!lower.trim()) {
                  setSuggestions([]);
                } else {
                  const histQueries = history
                    .map((h) => h.query)
                    .filter((q) => !!q)
                    .slice(0, 40); // small cap
                  const pool = Array.from(
                    new Set([...staticSamples, ...histQueries])
                  );
                  const filtered = pool
                    .filter((q) => q.toLowerCase().includes(lower))
                    .sort((a, b) => a.localeCompare(b))
                    .slice(0, 5);
                  setSuggestions(filtered);
                }
              }}
              onKeyDown={(e) => {
                if (submitting && mode === "nl") {
                  // Allow Escape to cancel suggestion box only
                  if (e.key === "Escape") {
                    setSuggestions([]);
                    setHighlightIndex(-1);
                  }
                  e.preventDefault();
                  return;
                }
                if (suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightIndex((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIndex(
                      (i) => (i - 1 + suggestions.length) % suggestions.length
                    );
                    return;
                  }
                  if (e.key === "Tab") {
                    if (highlightIndex >= 0) {
                      e.preventDefault();
                      const chosen = suggestions[highlightIndex];
                      setText(chosen);
                      setSuggestions([]);
                      return;
                    }
                  }
                  if (e.key === "Escape") {
                    setSuggestions([]);
                    setHighlightIndex(-1);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey && highlightIndex >= 0) {
                    e.preventDefault();
                    const chosen = suggestions[highlightIndex];
                    setText(chosen);
                    setSuggestions([]);
                    // Don't auto-run; user presses Enter again to submit.
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!submitting && text.trim()) {
                    performQuery(text, mode);
                  }
                }
              }}
              placeholder={
                mode === "nl"
                  ? "Ask in natural language (e.g. sum total balance in the last 30 hours)"
                  : "Echo test..."
              }
              rows={1}
              style={{
                width: "100%",
                minHeight: 52,
                maxHeight: 180,
                padding: "0.65rem .75rem",
                fontSize: "0.95rem",
                lineHeight: 1.35,
                border: "1px solid #c7c7c7",
                borderRadius: 8,
                resize: "vertical",
                fontFamily: "inherit",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04) inset",
                overflow: "auto",
                background: submitting && mode === "nl" ? "#f3f3f3" : "#fff",
                opacity: submitting && mode === "nl" ? 0.65 : 1,
                pointerEvents: submitting && mode === "nl" ? "none" : "auto",
              }}
              disabled={submitting && mode === "nl"}
            />
            {suggestions.length > 0 && (
              <div
                ref={suggestBoxRef}
                role="listbox"
                aria-label="Query suggestions"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  background: "#fff",
                  border: "1px solid #d7d7d7",
                  borderRadius: 8,
                  boxShadow: "0 4px 10px rgba(0,0,0,0.10)",
                  zIndex: 20,
                  overflow: "hidden",
                }}
              >
                {suggestions.map((s, idx) => (
                  <button
                    key={s + idx}
                    type="button"
                    role="option"
                    aria-selected={highlightIndex === idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      setText(s);
                      setSuggestions([]);
                      textareaRef.current?.focus();
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: ".55rem .7rem",
                      fontSize: ".7rem",
                      background:
                        highlightIndex === idx ? "#eef1fd" : "transparent",
                      border: "none",
                      borderBottom:
                        idx !== suggestions.length - 1
                          ? "1px solid #eee"
                          : "none",
                      cursor: "pointer",
                      color: "#222",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            style={{
              background: "#4c63d2",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.75rem 1.4rem",
              fontWeight: 600,
              cursor: "pointer",
              opacity: !text.trim() || submitting ? 0.6 : 1,
              transition: "background .15s",
              alignSelf: "flex-end",
            }}
          >
            {submitting
              ? mode === "nl"
                ? "Translating..."
                : "Submitting..."
              : mode === "nl"
              ? "Run NL Query"
              : "Submit"}
          </button>
        </form>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          gap: "1.25rem",
          alignItems: "flex-start",
          padding: "0 1rem",
          flexWrap: "wrap",
        }}
      >
        {!submitting &&
          (lastQuery !== null ||
            response !== null ||
            sql !== null ||
            error) && (
            <div
              style={{
                maxWidth: 680,
                width: "48vw",
                minWidth: 420,
                margin: "0 auto 2.5rem",
                background: "#fafafa",
                border: "1px solid #e2e2e2",
                borderRadius: 10,
                padding: "1rem 1.2rem 1.2rem",
                boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
                fontSize: ".92rem",
                lineHeight: 1.4,
              }}
            >
              {lastQuery !== null && (
                <div style={{ marginBottom: "0.85rem" }}>
                  <div
                    style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}
                  >
                    Query:
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", color: "#222" }}>
                    {lastQuery}
                  </div>
                </div>
              )}
              {mode === "echo" && response !== null && !error && (
                <div style={{ marginBottom: 0 }}>
                  <div
                    style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}
                  >
                    Response:
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", color: "#174b24" }}>
                    {response}
                  </div>
                </div>
              )}
              {mode === "nl" && sql !== null && !error && (
                <>
                  <div style={{ marginBottom: "0.85rem" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#333",
                        marginBottom: 4,
                      }}
                    >
                      Generated SQL:
                    </div>
                    <pre
                      style={{
                        background: "#1e1e1e",
                        color: "#d4d4d4",
                        padding: "0.75rem 0.9rem",
                        borderRadius: 6,
                        fontSize: "0.8rem",
                        overflowX: "auto",
                      }}
                    >
                      {sql}
                    </pre>
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#333",
                        marginBottom: 4,
                      }}
                    >
                      Result Rows (JSON):
                    </div>
                    <pre
                      style={{
                        background: "#f0f0f0",
                        color: "#222",
                        padding: "0.75rem 0.9rem",
                        borderRadius: 6,
                        fontSize: "0.75rem",
                        overflowX: "auto",
                      }}
                    >
                      {JSON.stringify(rows, null, 2)}
                    </pre>
                  </div>
                  {warning && (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        fontSize: ".75rem",
                        color: "#664400",
                        background: "#fff6e0",
                        padding: "0.5rem 0.75rem",
                        borderRadius: 6,
                      }}
                    >
                      {warning}
                    </div>
                  )}
                </>
              )}
              {rawJson && !error && (
                <div style={{ marginTop: "1rem" }}>
                  <div
                    style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}
                  >
                    Raw API Response (JSON):
                  </div>
                  <pre
                    style={{
                      background: "#f7f7f7",
                      color: "#222",
                      padding: "0.65rem 0.8rem",
                      borderRadius: 6,
                      fontSize: "0.7rem",
                      overflowX: "auto",
                      maxHeight: 300,
                    }}
                  >
                    {JSON.stringify(rawJson, null, 2)}
                  </pre>
                </div>
              )}
              {error && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#5d1111",
                      marginBottom: 4,
                    }}
                  >
                    Error:
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", color: "#7a1f1f" }}>
                    {error}
                  </div>
                </div>
              )}
            </div>
          )}
        {/* History Toggle Button (fixed to right) */}
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
          aria-controls="query-history-panel"
          style={{
            position: "fixed",
            top: "6rem",
            right: historyOpen ? 330 : 16,
            zIndex: 40,
            background: "#4c63d2",
            color: "#fff",
            border: "none",
            borderRadius: 24,
            padding: "0.6rem 1rem",
            fontSize: ".75rem",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            transition: "right .25s ease",
          }}
        >
          {historyOpen ? "Close History" : "Query History"}
        </button>

        {/* Collapsible History Drawer */}
        <div
          id="query-history-panel"
          role="region"
          aria-label="Query History"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            height: "100vh",
            width: 320,
            maxWidth: "80vw",
            background: "#fbfbfb",
            borderLeft: "1px solid #e2e2e2",
            boxShadow: "0 0 14px -2px rgba(0,0,0,0.18)",
            transform: historyOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform .25s ease",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "0.85rem 0.9rem 0.65rem",
              borderBottom: "1px solid #e4e4e4",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: ".8rem", color: "#333" }}>
              Query History (session)
            </div>
            {history.length === 0 && (
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: ".65rem",
                  color: "#666",
                }}
              >
                No queries yet.
              </div>
            )}
          </div>
          <div style={{ overflowY: "auto", padding: "0.6rem 0.8rem 1rem" }}>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {history.map((h) => {
                const expanded = expandedHistoryId === h.id;
                return (
                  <li key={h.id}>
                    <div
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 6,
                        background: "#fff",
                        padding: "0.45rem 0.55rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <button
                        onClick={() =>
                          setExpandedHistoryId(expanded ? null : h.id)
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                        aria-expanded={expanded}
                        aria-controls={`hist-details-${h.id}`}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: ".65rem",
                              fontWeight: 600,
                              color: "#555",
                            }}
                          >
                            {h.mode === "nl" ? "NL" : "Echo"}
                          </span>
                          <span style={{ fontSize: ".55rem", color: "#777" }}>
                            {new Date(h.ts).toLocaleTimeString()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: ".63rem",
                            color: "#222",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {h.query}
                        </div>
                        {h.sql && (
                          <div
                            style={{
                              fontSize: ".55rem",
                              color: "#555",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            SQL: {h.sql}
                          </div>
                        )}
                        {typeof h.rowsCount === "number" && (
                          <div style={{ fontSize: ".55rem", color: "#555" }}>
                            rows: {h.rowsCount}
                          </div>
                        )}
                        {h.error && (
                          <div style={{ fontSize: ".55rem", color: "#8a1f1f" }}>
                            error
                          </div>
                        )}
                      </button>
                      {expanded && (
                        <div
                          id={`hist-details-${h.id}`}
                          style={{
                            marginTop: 4,
                            borderTop: "1px dashed #e0e0e0",
                            paddingTop: 6,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setText(h.query);
                                setMode(h.mode);
                                performQuery(h.query, h.mode);
                                setHistoryOpen(false);
                              }}
                              style={{
                                background: "#4c63d2",
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                padding: "0.35rem 0.7rem",
                                fontSize: ".65rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Run Again
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setText(h.query);
                                setMode(h.mode);
                                resetBeforeRun();
                              }}
                              style={{
                                background: "#f1f1f1",
                                color: "#222",
                                border: "1px solid #ccc",
                                borderRadius: 6,
                                padding: "0.35rem 0.7rem",
                                fontSize: ".65rem",
                                cursor: "pointer",
                              }}
                            >
                              Load Only
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedHistoryId(null)}
                              style={{
                                marginLeft: "auto",
                                background: "transparent",
                                color: "#444",
                                border: "none",
                                fontSize: ".6rem",
                                cursor: "pointer",
                                textDecoration: "underline",
                              }}
                            >
                              Collapse
                            </button>
                          </div>
                          {h.sql && (
                            <pre
                              style={{
                                background: "#fafafa",
                                border: "1px solid #eee",
                                padding: "0.4rem 0.5rem",
                                borderRadius: 4,
                                fontSize: ".55rem",
                                overflowX: "auto",
                              }}
                            >
                              {h.sql}
                            </pre>
                          )}
                          {h.error && (
                            <div
                              style={{ fontSize: ".6rem", color: "#8a1f1f" }}
                            >
                              Previous error: {h.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Query;
