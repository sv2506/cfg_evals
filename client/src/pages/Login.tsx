import React, { useState } from "react";

interface LoginProps {
  onSuccess: (email: string) => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    // No real auth; immediately succeed
    setTimeout(() => {
      onSuccess(email);
    }, 150);
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
        padding: "2rem",
      }}
    >
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "2rem",
          width: "100%",
          maxWidth: 400,
          background: "#fff",
        }}
      >
        <h1 style={{ marginTop: 0, textAlign: "center", fontSize: "1.5rem" }}>
          Login
        </h1>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                marginBottom: 4,
                color: "#555",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.55rem .6rem",
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
              placeholder="you@example.com"
            />
          </div>
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                marginBottom: 4,
                color: "#555",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.55rem .6rem",
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={!email || !password || submitting}
            style={{
              width: "100%",
              padding: "0.65rem",
              background: "#4c63d2",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 600,
              cursor: "pointer",
              opacity: !email || !password || submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
