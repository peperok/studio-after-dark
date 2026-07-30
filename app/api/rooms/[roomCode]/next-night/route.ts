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
        .select(
          `
            id,
            day_number,
            night_number,
            winner
          `,
        )
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

    if (room.winner) {
      return NextResponse.json(
        {
          error:
            "Game sudah selesai.",
        },
        {
          status: 400,
        },
      );
    }

    const nextDayNumber =
      room.day_number + 1;

    const nextNightNumber =
      room.night_number + 1;

    const { error: updateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          phase: "night",
          night_step: "werewolf",
          day_number: nextDayNumber,
          night_number:
            nextNightNumber,
          announcement:
            "Werewolves, open your eyes.",
          eliminated_player_name:
            null,
        })
        .eq("id", room.id);

    if (updateError) {
      console.error(updateError);

      return NextResponse.json(
        {
          error:
            "Gagal memulai malam berikutnya.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      dayNumber: nextDayNumber,
      nightNumber:
        nextNightNumber,
    });
  } catch (error) {
    console.error(
      "Next night error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat memulai malam berikutnya.",
      },
      {
        status: 500,
      },
    );
  }
}