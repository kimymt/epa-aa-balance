import { test, expect } from "bun:test";
import { render, fireEvent, waitFor } from "@testing-library/react";
import AdminDashboard from "./AdminDashboard";

test("legacy token is erased and fresh token is sent only in the header", async () => {
  const oldFetch = globalThis.fetch;
  localStorage.setItem("eaa-scorer-admin-token", "old-secret");
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ error: "test" }, { status: 401 });
  }) as unknown as typeof fetch;
  const view = render(<AdminDashboard />);
  try {
    expect(localStorage.getItem("eaa-scorer-admin-token")).toBeNull();
    expect(calls).toHaveLength(0);
    fireEvent.change(view.getByPlaceholderText("トークンを貼り付け"), { target: { value: "new-secret" } });
    fireEvent.click(view.getByText("認証して取得"));
    await waitFor(() => expect(calls).toHaveLength(1), { container: view.container });
    expect(calls[0].url).toBe("/api/feedback?version=all");
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer new-secret");
    expect(localStorage.getItem("eaa-scorer-admin-token")).toBeNull();
    await waitFor(() => expect(view.getByText("トークンを変更")).toBeTruthy(), { container: view.container });
    fireEvent.click(view.getByText("トークンを変更"));
    expect(calls[0].init?.signal?.aborted).toBe(true);
  } finally {
    view.unmount();
    globalThis.fetch = oldFetch;
  }
});
