import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET(req: Request) {
  try {
    const configuredTestRecipient = process.env.TEST_EMAIL_RECIPIENT?.trim();
    const headerToken = process.env.TEST_EMAIL_ROUTE_TOKEN?.trim();
    const nodeEnv = process.env.NODE_ENV;

    if (!configuredTestRecipient) {
      return NextResponse.json(
        { success: false, error: "TEST_EMAIL_RECIPIENT is not configured." },
        { status: 500 }
      );
    }

    // Keep this endpoint disabled-by-default in production unless an explicit token is configured.
    if (nodeEnv === "production") {
      if (!headerToken) {
        return NextResponse.json(
          { success: false, error: "Test email route is disabled in production." },
          { status: 403 }
        );
      }

      const requestToken = req.headers.get("x-test-email-token")?.trim();
      if (requestToken !== headerToken) {
        return NextResponse.json(
          { success: false, error: "Unauthorized." },
          { status: 401 }
        );
      }
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