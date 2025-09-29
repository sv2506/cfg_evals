import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Query from "./pages/Query";
import Login from "./pages/Login";
const App: React.FC = () => {
  const [authed, setAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  return (
    <BrowserRouter>
      <div className="app-layout">
        {authed && (
          <Navbar
            onLogout={() => {
              setAuthed(false);
              setUserEmail("");
            }}
          />
        )}
        <main className="main-content">
          <Routes>
            {!authed && (
              <Route
                path="/login"
                element={
                  <Login
                    onSuccess={(email) => {
                      setUserEmail(email);
                      setAuthed(true);
                    }}
                  />
                }
              />
            )}
            <Route
              path="/"
              element={
                authed ? (
                  <Home email={userEmail} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/query"
              element={authed ? <Query /> : <Navigate to="/login" replace />}
            />
            <Route
              path="*"
              element={<Navigate to={authed ? "/" : "/login"} replace />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
