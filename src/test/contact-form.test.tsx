import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";

// The home page's early-access form, rendered on its own page component.
// fetch is mocked: nothing here reaches the real database.
const Index = Route.options.component as ComponentType;

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function openForm() {
  render(<Index />);
  fireEvent.click(screen.getAllByRole("button", { name: /get early access/i })[0]!);
  const dialog = screen.getByRole("dialog");
  const form = dialog.querySelector("form") as HTMLFormElement;
  return { dialog, form };
}

function fill(form: HTMLFormElement, values: { name: string; email: string; message: string }) {
  fireEvent.change(form.elements.namedItem("name") as HTMLInputElement, {
    target: { value: values.name },
  });
  fireEvent.change(form.elements.namedItem("email") as HTMLInputElement, {
    target: { value: values.email },
  });
  fireEvent.change(form.elements.namedItem("message") as HTMLTextAreaElement, {
    target: { value: values.message },
  });
}

describe("Contact form", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the database's email rule in the email field", () => {
    const { form } = openForm();
    const email = form.elements.namedItem("email") as HTMLInputElement;
    expect(email).toHaveAttribute("pattern", "[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    expect(email).toBeRequired();
  });

  it("posts trimmed fields to contact_messages and shows the sent state on 201", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const { dialog, form } = openForm();
    fill(form, {
      name: "  Rana Haddad ",
      email: " rana@example.com ",
      message: "  Count me in.  ",
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent("Your message has been sent"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/contact_messages$/);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["apikey"]).toMatch(/^sb_publishable_/);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Prefer"]).toBe("return=minimal");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Rana Haddad",
      email: "rana@example.com",
      topic: "early-access",
      message: "Count me in.",
      source: "website",
    });
  });

  it("asks to check the email address when the database answers 400", async () => {
    fetchMock.mockResolvedValue(new Response('{"code":"23514"}', { status: 400 }));
    const { dialog, form } = openForm();
    fill(form, { name: "Rana", email: "rana@example", message: "Hello" });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Check your email address and try again.",
      ),
    );
    expect(within(dialog).queryByText(/try again in a moment/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
  });

  it("refuses a name or message that is only spaces, without sending", () => {
    const { dialog, form } = openForm();
    fill(form, { name: "   ", email: "rana@example.com", message: "Hello" });
    fireEvent.submit(form);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Add your name.");

    fill(form, { name: "Rana", email: "rana@example.com", message: " \n  " });
    fireEvent.submit(form);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Write a message.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a bot that fills the hidden field the sent state and sends nothing", async () => {
    const { dialog, form } = openForm();
    fill(form, { name: "Bot", email: "bot@example.com", message: "Buy now" });
    fireEvent.change(form.elements.namedItem("company") as HTMLInputElement, {
      target: { value: "Spam Inc" },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent("Your message has been sent"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
