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

    const { error: updateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          phase: "discussion",
          night_step: null,
          announcement:
            "Discuss. Who can you trust?",
        })
        .eq("id", room.id);

    if (updateError) {
      console.error(updateError);

      return NextResponse.json(
        {
          error:
            "Gagal memulai diskusi.",
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
      "Start discussion error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat memulai diskusi.",
      },
      {
        status: 500,
      },
    );
  }
}