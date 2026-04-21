import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  try {
    const configuredTestRecipient = process.env.TEST_EMAIL_RECIPIENT?.trim();
    const nodeEnv = process.env.NODE_ENV;

    if (!configuredTestRecipient) {
      return NextResponse.json(
        { success: false, error: "TEST_EMAIL_RECIPIENT is not configured." },
        { status: 500 }
      );
    }

    // Always disable this endpoint in production.
    if (nodeEnv === "production") {
      return NextResponse.json(
        { success: false, error: "Test email route is disabled in production." },
        { status: 403 }
      );
    }

    await sendEmail({
      to: configuredTestRecipient,
      subject: "FindMySpace Test Email",
      html: `
        <div style="font-family: Arial; color: #192a3a;">
          <h2>✅ Email is working</h2>
          <p>This is a test email from FindMySpace.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}