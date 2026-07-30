import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      roomCode: string;
    }>;
  },
) {
  try {
    const { roomCode } = await context.params;

    const cleanRoomCode = roomCode
      .trim()
      .toUpperCase();

    const { data: room, error: roomError } =
      await supabaseAdmin
        .from("rooms")
        .select("id, day_number")
        .eq("code", cleanRoomCode)
        .single();

    if (roomError || !room) {
      return NextResponse.json(
        {
          error: "Room tidak ditemukan.",
        },
        {
          status: 404,
        },
      );
    }

    const { error: deleteError } =
      await supabaseAdmin
        .from("day_votes")
        .delete()
        .eq("room_id", room.id)
        .eq(
          "day_number",
          room.day_number,
        );

    if (deleteError) {
      console.error(deleteError);

      return NextResponse.json(
        {
          error:
            "Gagal membersihkan vote sebelumnya.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: updateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          phase: "voting",
          night_step: null,
          announcement:
            "Vote for the player you suspect.",
        })
        .eq("id", room.id);

    if (updateError) {
      console.error(updateError);

      return NextResponse.json(
        {
          error:
            "Gagal memulai voting.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      dayNumber: room.day_number,
    });
  } catch (error) {
    console.error(
      "Start voting error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat memulai voting.",
      },
      {
        status: 500,
      },
    );
  }
}