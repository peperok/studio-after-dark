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
    const cleanRoomCode = roomCode.trim().toUpperCase();

    const { data: room, error: roomError } =
      await supabaseAdmin
        .from("rooms")
        .select("id, night_number")
        .eq("code", cleanRoomCode)
        .single();

    if (roomError || !room) {
      console.error("Room error:", roomError);

      return NextResponse.json(
        {
          error: "Room tidak ditemukan.",
        },
        {
          status: 404,
        },
      );
    }

    const currentNightNumber =
      typeof room.night_number === "number"
        ? room.night_number
        : 1;

    const { error: deleteError } =
      await supabaseAdmin
        .from("night_actions")
        .delete()
        .eq("room_id", room.id)
        .eq("night_number", currentNightNumber)
        .eq("action_type", "kill");

    if (deleteError) {
      console.error(
        "Delete previous actions error:",
        deleteError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal membersihkan vote Werewolf sebelumnya.",
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
          phase: "night",
          night_step: "werewolf",
          night_number: currentNightNumber,
          announcement:
            "Werewolves, open your eyes.",
        })
        .eq("id", room.id);

    if (updateError) {
      console.error(
        "Update room error:",
        updateError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal memulai giliran Werewolf.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      nightNumber: currentNightNumber,
    });
  } catch (error) {
    console.error(
      "Start Werewolf unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat memulai giliran Werewolf.",
      },
      {
        status: 500,
      },
    );
  }
}