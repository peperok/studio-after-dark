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
          error: "Player ID atau token tidak tersedia.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: player, error: playerError } =
      await supabaseAdmin
        .from("players")
        .select("id, player_token")
        .eq("id", playerId)
        .eq("player_token", playerToken)
        .single();

    if (playerError || !player) {
      return NextResponse.json(
        {
          error: "Session pemain tidak valid.",
        },
        {
          status: 401,
        },
      );
    }

    const { error: updateError } =
      await supabaseAdmin
        .from("players")
        .update({
          is_ready: true,
        })
        .eq("id", player.id);

    if (updateError) {
      console.error(updateError);

      return NextResponse.json(
        {
          error: "Gagal mengonfirmasi role.",
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
    console.error("Confirm role error:", error);

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengonfirmasi role.",
      },
      {
        status: 500,
      },
    );
  }
}