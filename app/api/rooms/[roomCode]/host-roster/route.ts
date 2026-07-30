import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RoleRow = {
  player_id: string;
  role:
    | "werewolf"
    | "seer"
    | "doctor"
    | "villager";
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      roomCode: string;
    }>;
  },
) {
  try {
    const { roomCode } =
      await context.params;

    const cleanRoomCode =
      roomCode
        .trim()
        .toUpperCase();

    const {
      data: room,
      error: roomError,
    } = await supabaseAdmin
      .from("rooms")
      .select("id")
      .eq("code", cleanRoomCode)
      .single();

    if (
      roomError ||
      !room
    ) {
      return NextResponse.json(
        {
          error:
            "Room tidak ditemukan.",
        },
        {
          status: 404,
        },
      );
    }

    const {
      data: players,
      error: playersError,
    } = await supabaseAdmin
      .from("players")
      .select(
        `
          id,
          nickname,
          is_alive,
          is_ready,
          is_connected,
          created_at
        `,
      )
      .eq("room_id", room.id)
      .order("created_at", {
        ascending: true,
      });

    if (playersError) {
      return NextResponse.json(
        {
          error:
            "Gagal mengambil pemain.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      data: roles,
      error: rolesError,
    } = await supabaseAdmin
      .from("player_roles")
      .select(
        "player_id, role",
      )
      .eq("room_id", room.id);

    if (rolesError) {
      console.error(
        "Host roster roles error:",
        rolesError,
      );
    }

    const roleMap = new Map(
      (
        (roles ?? []) as RoleRow[]
      ).map((item) => [
        item.player_id,
        item.role,
      ]),
    );

    const roster =
      (players ?? []).map(
        (player) => ({
          ...player,
          role:
            roleMap.get(
              player.id,
            ) ?? null,
        }),
      );

    return NextResponse.json({
      success: true,
      roster,
    });
  } catch (error) {
    console.error(
      "Host roster error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengambil roster.",
      },
      {
        status: 500,
      },
    );
  }
}