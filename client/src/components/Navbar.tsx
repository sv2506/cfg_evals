import React from "react";
import { NavLink } from "react-router-dom";
import "./Navbar.css";

interface NavbarProps {
  onLogout?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onLogout }) => {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">CFG Evals</div>
      <div className="sidebar-body">
        <ul>
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/query"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Query
            </NavLink>
          </li>
        </ul>
      </div>
      {onLogout && (
        <div className="sidebar-footer">
          <button type="button" onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
