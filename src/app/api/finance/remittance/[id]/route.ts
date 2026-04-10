import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServiceSupabase();

    // Verify remittance exists
    const { data: remittance } = await supabase
      .from("remittances")
      .select("id, eft_number, file_name")
      .eq("id", id)
      .single();

    if (!remittance) {
      return NextResponse.json({ error: "Remittance not found" }, { status: 404 });
    }

    // Delete remittance — remittance_lines will cascade (ON DELETE CASCADE)
    const { error } = await supabase
      .from("remittances")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      deleted_remittance: remittance.file_name,
      eft_number: remittance.eft_number,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
