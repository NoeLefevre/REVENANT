import { NextResponse } from "next/server";
import { Resend } from "resend";
import config from "@/config";

// GET /api/debug/resend-test
// Protected by x-internal header
// Tests Resend independently of NextAuth
export async function GET(req) {
  // Auth guard
  const internalSecret = req.headers.get("x-internal");
  if (internalSecret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKeyDefined = !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== "";
  const fromAddress = config.resend.fromNoReply;
  const toAddress = "test@test.com";

  if (!resendKeyDefined) {
    return NextResponse.json({
      success: false,
      error: "RESEND_API_KEY is not defined or empty",
      resendKeyDefined: false,
      fromAddress,
      toAddress,
    });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      subject: "REVENANT — Resend test",
      html: "<p>This is a test email from the debug route.</p>",
    });

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message || JSON.stringify(error),
        resendKeyDefined: true,
        fromAddress,
        toAddress,
      });
    }

    return NextResponse.json({
      success: true,
      error: null,
      resendKeyDefined: true,
      fromAddress,
      toAddress,
      resendResponse: data,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message,
      resendKeyDefined: true,
      fromAddress,
      toAddress,
    });
  }
}
