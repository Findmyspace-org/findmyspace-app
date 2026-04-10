import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  try {
    await sendEmail({
      to: "connect.schalk@gmail.com", // 👈 replace with your email
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