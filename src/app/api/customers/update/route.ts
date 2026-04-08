import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, phone, notes } = body;

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceSupabase();

    // Update warranty_registrations with this email
    if (name) {
      await supabase
        .from("warranty_registrations")
        .update({ customer_name: name })
        .eq("customer_email", email);
    }

    // Update warranties with this email
    const updates: Record<string, string> = {};
    if (name) updates.customer_name = name;
    if (phone) updates.customer_phone = phone;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("warranties")
        .update(updates)
        .eq("customer_email", email);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
