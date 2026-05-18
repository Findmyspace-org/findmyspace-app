import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const CONTACT_RECIPIENT = "info@findmyspace.co.za";
const DEFAULT_FROM = "FindMySpace <noreply@findmyspace.co.za>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatSubmittedAt(date: Date): string {
  return date.toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Please enter your email address." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json({ error: "Please enter a subject." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    }

    const submittedAt = new Date();
    const submittedAtLabel = formatSubmittedAt(submittedAt);
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #192a3a; line-height: 1.5;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">New contact form message</h2>
        <p style="margin: 0 0 8px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p style="margin: 0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p style="margin: 0 0 8px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p style="margin: 0 0 8px;"><strong>Submitted:</strong> ${escapeHtml(submittedAtLabel)}</p>
        <p style="margin: 16px 0 8px;"><strong>Message:</strong></p>
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    `;

    const text = [
      "New contact form message",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Subject: ${subject}`,
      `Submitted: ${submittedAtLabel}`,
      "",
      "Message:",
      message,
    ].join("\n");

    const result = await sendEmail({
      from,
      to: CONTACT_RECIPIENT,
      subject: `[Contact] ${subject}`,
      html,
      text,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "We couldn't send your message right now. Please try again later or email us directly.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
