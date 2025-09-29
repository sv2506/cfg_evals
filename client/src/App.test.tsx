import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

test("login screen shows first then navigates to home", async () => {
  render(<App />);
  // Login heading visible
  expect(screen.getByRole("heading", { name: /login/i })).toBeInTheDocument();

  // Fill form
  fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
    target: { value: "secret123" },
  });

  fireEvent.click(screen.getByRole("button", { name: /login/i }));

  // After success (delayed setTimeout), Home should appear
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: /home/i })).toBeInTheDocument()
  );
  expect(screen.getByText(/welcome to cfg evals/i)).toBeInTheDocument();
});
