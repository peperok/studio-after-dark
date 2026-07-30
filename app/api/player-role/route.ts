import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId
        : "";

    const playerToken =
      typeof body.playerToken === "string"
        ? body.playerToken
        : "";

    if (!playerId || !playerToken) {
      return NextResponse.json(
        {
          error:
            "Player ID atau token tidak tersedia.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: player, error: playerError } =
      await supabaseAdmin
        .from("players")
        .select(
          "id, room_id, nickname, player_token",
        )
        .eq("id", playerId)
        .eq("player_token", playerToken)
        .single();

    if (playerError || !player) {
      return NextResponse.json(
        {
          error:
            "Session pemain tidak valid.",
        },
        {
          status: 401,
        },
      );
    }

    const { data: playerRole, error: roleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("role")
        .eq("player_id", player.id)
        .single();

    if (roleError || !playerRole) {
      return NextResponse.json(
        {
          error:
            "Role belum dibagikan.",
        },
        {
          status: 404,
        },
      );
    }

    let teammates: string[] = [];

    if (playerRole.role === "werewolf") {
      const { data: wolfRoles } =
        await supabaseAdmin
          .from("player_roles")
          .select("player_id")
          .eq("room_id", player.room_id)
          .eq("role", "werewolf");

      const teammateIds = (wolfRoles ?? [])
        .map((item) => item.player_id)
        .filter(
          (teammateId) =>
            teammateId !== player.id,
        );

      if (teammateIds.length > 0) {
        const { data: teammatePlayers } =
          await supabaseAdmin
            .from("players")
            .select("nickname")
            .in("id", teammateIds);

        teammates = (teammatePlayers ?? []).map(
          (teammate) => teammate.nickname,
        );
      }
    }

    return NextResponse.json({
      role: playerRole.role,
      teammates,
    });
  } catch (error) {
    console.error(
      "Get player role error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengambil role.",
      },
      {
        status: 500,
      },
    );
  }
}