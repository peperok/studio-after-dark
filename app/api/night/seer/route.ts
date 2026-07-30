import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RequestBody = {
  playerId?: string;
  playerToken?: string;
  targetPlayerId?: string;
};

async function validateSeer(
  playerId: string,
  playerToken: string,
) {
  const { data: player, error: playerError } =
    await supabaseAdmin
      .from("players")
      .select(
        `
          id,
          room_id,
          nickname,
          player_token,
          is_alive
        `,
      )
      .eq("id", playerId)
      .eq("player_token", playerToken)
      .single();

  if (
    playerError ||
    !player ||
    !player.is_alive
  ) {
    return {
      error: "Session pemain tidak valid.",
      player: null,
      room: null,
    };
  }

  const { data: roleData, error: roleError } =
    await supabaseAdmin
      .from("player_roles")
      .select("role")
      .eq("player_id", player.id)
      .single();

  if (
    roleError ||
    !roleData ||
    roleData.role !== "seer"
  ) {
    return {
      error: "Pemain ini bukan Seer.",
      player: null,
      room: null,
    };
  }

  const { data: room, error: roomError } =
    await supabaseAdmin
      .from("rooms")
      .select(
        `
          id,
          phase,
          night_step,
          night_number
        `,
      )
      .eq("id", player.room_id)
      .single();

  if (
    roomError ||
    !room ||
    room.phase !== "night" ||
    room.night_step !== "seer"
  ) {
    return {
      error:
        "Saat ini bukan giliran Seer.",
      player: null,
      room: null,
    };
  }

  return {
    error: null,
    player,
    room,
  };
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as RequestBody;

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

    const validation = await validateSeer(
      playerId,
      playerToken,
    );

    if (
      validation.error ||
      !validation.player ||
      !validation.room
    ) {
      return NextResponse.json(
        {
          error:
            validation.error ||
            "Pemain tidak valid.",
        },
        {
          status: 401,
        },
      );
    }

    const { data: targets, error: targetError } =
      await supabaseAdmin
        .from("players")
        .select("id, nickname")
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("is_alive", true)
        .neq("id", validation.player.id)
        .order("created_at", {
          ascending: true,
        });

    if (targetError) {
      console.error(
        "Get Seer targets error:",
        targetError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal mengambil daftar pemain.",
        },
        {
          status: 500,
        },
      );
    }

    const { data: existingAction } =
      await supabaseAdmin
        .from("night_actions")
        .select("target_player_id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "night_number",
          validation.room.night_number,
        )
        .eq(
          "actor_player_id",
          validation.player.id,
        )
        .eq("action_type", "inspect")
        .maybeSingle();

    return NextResponse.json({
      targets: targets ?? [],
      selectedTargetId:
        existingAction?.target_player_id ??
        null,
      hasSubmitted: Boolean(existingAction),
    });
  } catch (error) {
    console.error(
      "Get Seer targets unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengambil target Seer.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body =
      (await request.json()) as RequestBody;

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId
        : "";

    const playerToken =
      typeof body.playerToken === "string"
        ? body.playerToken
        : "";

    const targetPlayerId =
      typeof body.targetPlayerId === "string"
        ? body.targetPlayerId
        : "";

    if (
      !playerId ||
      !playerToken ||
      !targetPlayerId
    ) {
      return NextResponse.json(
        {
          error:
            "Data pemeriksaan belum lengkap.",
        },
        {
          status: 400,
        },
      );
    }

    const validation = await validateSeer(
      playerId,
      playerToken,
    );

    if (
      validation.error ||
      !validation.player ||
      !validation.room
    ) {
      return NextResponse.json(
        {
          error:
            validation.error ||
            "Pemain tidak valid.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      targetPlayerId ===
      validation.player.id
    ) {
      return NextResponse.json(
        {
          error:
            "Seer tidak bisa memeriksa dirinya sendiri.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: target, error: targetError } =
      await supabaseAdmin
        .from("players")
        .select(
          "id, room_id, nickname, is_alive",
        )
        .eq("id", targetPlayerId)
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("is_alive", true)
        .single();

    if (targetError || !target) {
      return NextResponse.json(
        {
          error:
            "Target tidak tersedia.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: targetRole, error: roleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("role")
        .eq("player_id", target.id)
        .single();

    if (roleError || !targetRole) {
      console.error(
        "Get target role error:",
        roleError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal memeriksa role target.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: actionError } =
      await supabaseAdmin
        .from("night_actions")
        .upsert(
          {
            room_id: validation.room.id,
            night_number:
              validation.room.night_number,
            actor_player_id:
              validation.player.id,
            action_type: "inspect",
            target_player_id: target.id,
          },
          {
            onConflict:
              "room_id,night_number,actor_player_id,action_type",
          },
        );

    if (actionError) {
      console.error(
        "Save Seer action error:",
        actionError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal menyimpan pemeriksaan Seer.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      targetName: target.nickname,
      isWerewolf:
        targetRole.role === "werewolf",
    });
  } catch (error) {
    console.error(
      "Submit Seer action unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat memeriksa pemain.",
      },
      {
        status: 500,
      },
    );
  }
}