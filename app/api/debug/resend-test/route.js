import { NextResponse } from "next/server";
import { Resend } from "resend";
import config from "@/config";

// Temporary debug route — remove before going to prod
// Usage: GET /api/debug/resend-test
// Required header: x-internal: <value of INTERNAL_SECRET env var>
export async function GET(req) {
  const secret = req.headers.get("x-internal");
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKeyDefined = Boolean(process.env.RESEND_API_KEY);
  const fromAddress = config.resend.fromNoReply;
  const toAddress = "test@test.com";

  if (!resendKeyDefined) {
    return NextResponse.json({
      success: false,
      error: "RESEND_API_KEY is not defined",
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
      text: "If you receive this, Resend is working correctly.",
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
      emailId: data?.id,
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
