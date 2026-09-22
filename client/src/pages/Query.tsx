import React, { useMemo, useState } from "react";

type Mode = "nl" | "echo";

type QueryResult = {
  sql?: string;
  rows?: unknown[];
  mocked?: boolean;
  warning?: string;
  received?: string;
  length?: number;
};

type HistoryItem = {
  id: number;
  question: string;
  mode: Mode;
  result?: QueryResult;
  error?: string;
};

const examples = [
  "Count all users",
  "What is the average age of users?",
  "Sum the total balance for all users in the last 24 hours",
  "Count users by country",
];

const apiBase = (process.env.REACT_APP_API_BASE || "").replace(/\/$/, "");

const Query: React.FC = () => {
  const [question, setQuestion] = useState(examples[0]);
  const [mode, setMode] = useState<Mode>("nl");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const rows = useMemo(() => result?.rows ?? [], [result]);

  const runQuery = async (query = question, queryMode = mode) => {
    const cleanQuestion = query.trim();
    if (!cleanQuestion || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = queryMode === "nl" ? "/nl-query" : "/query";
      const body = queryMode === "nl" ? { question: cleanQuestion } : { text: cleanQuestion };
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed (${response.status})`);
      }

      const data: QueryResult = await response.json();
      setResult(data);
      setHistory((current) => [
        { id: Date.now(), question: cleanQuestion, mode: queryMode, result: data },
        ...current,
      ].slice(0, 8));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Request failed";
      setError(message);
      setHistory((current) => [
        { id: Date.now(), question: cleanQuestion, mode: queryMode, error: message },
        ...current,
      ].slice(0, 8));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="QueryGuard home">
          <span className="brand-mark">Q</span>
          <span>QueryGuard</span>
        </a>
        <div className="status-pill"><span /> Offline-safe demo</div>
      </header>

      <section className="hero">
        <div className="eyebrow">Natural-language analytics</div>
        <h1>Ask the data.<br />Inspect every step.</h1>
        <p>
          Translate plain-English questions into a restricted SQL subset, validate the output,
          and inspect the exact query before execution.
        </p>
      </section>

      <section className="workspace" aria-label="Query workspace">
        <div className="composer-card">
          <div className="card-heading">
            <div>
              <span className="step">01</span>
              <h2>Describe the analysis</h2>
            </div>
            <div className="mode-switch" aria-label="Query mode">
              <button className={mode === "nl" ? "active" : ""} onClick={() => setMode("nl")}>NL → SQL</button>
              <button className={mode === "echo" ? "active" : ""} onClick={() => setMode("echo")}>API echo</button>
            </div>
          </div>

          <label htmlFor="question">Question</label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                runQuery();
              }
            }}
            placeholder="Ask a question about the sample dataset…"
            rows={4}
          />

          <div className="examples">
            {examples.map((example) => (
              <button key={example} onClick={() => setQuestion(example)}>{example}</button>
            ))}
          </div>

          <div className="composer-footer">
            <span>Enter to run · Shift + Enter for a new line</span>
            <button className="run-button" onClick={() => runQuery()} disabled={!question.trim() || loading}>
              {loading ? "Translating…" : "Generate query"}<span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className="result-card">
          <div className="card-heading">
            <div>
              <span className="step">02</span>
              <h2>Inspect the result</h2>
            </div>
            {result && <span className={result.mocked ? "mode-badge mock" : "mode-badge"}>{result.mocked ? "Mock mode" : "Model mode"}</span>}
          </div>

          {!result && !error && !loading && (
            <div className="empty-state">
              <div className="empty-icon">⌁</div>
              <h3>Ready for a question</h3>
              <p>The generated SQL and returned rows will appear here.</p>
            </div>
          )}

          {loading && <div className="loading-state"><span /><span /><span /> Translating and validating</div>}
          {error && <div className="error-state"><strong>Request failed</strong><p>{error}</p></div>}

          {result && mode === "echo" && (
            <div className="echo-result"><span>API response</span><p>{result.received}</p></div>
          )}

          {result?.sql && (
            <div className="result-content">
              <div className="result-section">
                <div className="section-label"><span>Generated SQL</span><span className="validated">✓ Validated</span></div>
                <pre className="sql-block"><code>{result.sql}</code></pre>
              </div>
              <div className="result-section">
                <div className="section-label"><span>Result rows</span><span>{rows.length} returned</span></div>
                <pre className="json-block"><code>{JSON.stringify(rows, null, 2)}</code></pre>
              </div>
              {result.warning && <div className="warning">{result.warning}</div>}
            </div>
          )}
        </div>
      </section>

      <section className="history-section">
        <div className="history-title"><span className="step">03</span><h2>Recent runs</h2></div>
        {history.length === 0 ? (
          <p className="history-empty">Run a query to build a local session history.</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                className="history-item"
                onClick={() => {
                  setQuestion(item.question);
                  setMode(item.mode);
                  setResult(item.result ?? null);
                  setError(item.error ?? null);
                }}
              >
                <span className={item.error ? "history-status error" : "history-status"} />
                <span className="history-question">{item.question}</span>
                <span className="history-mode">{item.mode === "nl" ? "NL → SQL" : "Echo"}</span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>QueryGuard</span>
        <span>Prototype · Restricted SQL · Inspectable output</span>
      </footer>
    </main>
  );
};

export default Query;
