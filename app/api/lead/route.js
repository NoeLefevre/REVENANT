import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  const body = await req.json();

  if (!body.email || typeof body.email !== 'string') {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (!EMAIL_REGEX.test(body.email) || body.email.length > 254) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  await connectMongo();

  try {
    return NextResponse.json({});
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
