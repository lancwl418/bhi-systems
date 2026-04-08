import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { warranty_id, content, author } = body;

    if (!warranty_id || !content) {
      return NextResponse.json(
        { error: "warranty_id and content are required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceSupabase();

    const { data, error } = await supabase
      .from("warranty_comments")
      .insert({
        warranty_id,
        content,
        author: author || "CS",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, comment: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
