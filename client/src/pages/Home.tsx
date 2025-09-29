import React from "react";

interface HomeProps {
  email?: string;
}

const Home: React.FC<HomeProps> = ({ email }) => {
  return (
    <div className="page-content">
      <h1>Home</h1>
      <p>Welcome{email ? `, ${email}` : ""} to CFG Evals.</p>
    </div>
  );
};

export default Home;
