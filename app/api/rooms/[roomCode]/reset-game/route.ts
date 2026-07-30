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
        .select("id")
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

    const { error: nightActionError } =
      await supabaseAdmin
        .from("night_actions")
        .delete()
        .eq("room_id", room.id);

    if (nightActionError) {
      console.error(
        "Reset night actions error:",
        nightActionError,
      );
    }

    const { error: dayVoteError } =
      await supabaseAdmin
        .from("day_votes")
        .delete()
        .eq("room_id", room.id);

    if (dayVoteError) {
      console.error(
        "Reset day votes error:",
        dayVoteError,
      );
    }

    const { error: roleError } =
      await supabaseAdmin
        .from("player_roles")
        .delete()
        .eq("room_id", room.id);

    if (roleError) {
      console.error(
        "Reset roles error:",
        roleError,
      );
    }

    const { error: playerError } =
      await supabaseAdmin
        .from("players")
        .update({
          is_alive: true,
          is_ready: false,
          is_connected: true,
        })
        .eq("room_id", room.id);

    if (playerError) {
      console.error(
        "Reset players error:",
        playerError,
      );

      return NextResponse.json(
        {
          error: "Gagal mereset pemain.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: roomUpdateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          status: "lobby",
          phase: "lobby",
          night_step: null,
          day_number: 1,
          night_number: 1,
          announcement: "",
          eliminated_player_name: null,
          winner: null,
          phase_ends_at: null,
        })
        .eq("id", room.id);

    if (roomUpdateError) {
      console.error(
        "Reset room error:",
        roomUpdateError,
      );

      return NextResponse.json(
        {
          error: "Gagal mereset room.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Reset game unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mereset game.",
      },
      {
        status: 500,
      },
    );
  }
}