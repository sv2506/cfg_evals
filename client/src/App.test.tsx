import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the analytics workspace", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /ask the data/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /generate query/i })).toBeInTheDocument();
});
