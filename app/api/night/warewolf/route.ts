import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RequestBody = {
  playerId?: string;
  playerToken?: string;
  targetPlayerId?: string;
};

async function validateWerewolf(
  playerId: string,
  playerToken: string,
) {
  const { data: player, error: playerError } =
    await supabaseAdmin
      .from("players")
      .select(
        "id, room_id, nickname, player_token, is_alive",
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
    roleData.role !== "werewolf"
  ) {
    return {
      error:
        "Pemain ini bukan Werewolf.",
      player: null,
      room: null,
    };
  }

  const { data: room, error: roomError } =
    await supabaseAdmin
      .from("rooms")
      .select(
        "id, phase, night_step, night_number",
      )
      .eq("id", player.room_id)
      .single();

  if (
    roomError ||
    !room ||
    room.phase !== "night" ||
    room.night_step !== "werewolf"
  ) {
    return {
      error:
        "Saat ini bukan giliran Werewolf.",
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

// Mengambil daftar target Werewolf.
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

    const validation =
      await validateWerewolf(
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

    const { data: wolfRoles } =
      await supabaseAdmin
        .from("player_roles")
        .select("player_id")
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("role", "werewolf");

    const werewolfIds = (
      wolfRoles ?? []
    ).map((item) => item.player_id);

    const { data: targets, error: targetError } =
      await supabaseAdmin
        .from("players")
        .select("id, nickname")
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("is_alive", true)
        .not(
          "id",
          "in",
          `(${werewolfIds.join(",")})`,
        )
        .order("created_at", {
          ascending: true,
        });

    if (targetError) {
      console.error(targetError);

      return NextResponse.json(
        {
          error:
            "Gagal mengambil target.",
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
        .eq("action_type", "kill")
        .maybeSingle();

    return NextResponse.json({
      targets: targets ?? [],
      selectedTargetId:
        existingAction?.target_player_id ??
        null,
    });
  } catch (error) {
    console.error(
      "Get Werewolf targets error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengambil target.",
      },
      {
        status: 500,
      },
    );
  }
}

// Mengirim atau mengganti vote Werewolf.
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
            "Data vote belum lengkap.",
        },
        {
          status: 400,
        },
      );
    }

    const validation =
      await validateWerewolf(
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

    const { data: target, error: targetError } =
      await supabaseAdmin
        .from("players")
        .select("id, room_id, is_alive")
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

    const { data: targetRole } =
      await supabaseAdmin
        .from("player_roles")
        .select("role")
        .eq("player_id", target.id)
        .single();

    if (targetRole?.role === "werewolf") {
      return NextResponse.json(
        {
          error:
            "Werewolf tidak bisa memilih sesama Werewolf.",
        },
        {
          status: 400,
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
            action_type: "kill",
            target_player_id:
              targetPlayerId,
          },
          {
            onConflict:
              "room_id,night_number,actor_player_id,action_type",
          },
        );

    if (actionError) {
      console.error(actionError);

      return NextResponse.json(
        {
          error:
            "Gagal menyimpan vote.",
        },
        {
          status: 500,
        },
      );
    }

    const { count: totalWerewolves } =
      await supabaseAdmin
        .from("player_roles")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("role", "werewolf");

    const { data: alivePlayers } =
      await supabaseAdmin
        .from("players")
        .select("id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("is_alive", true);

    const aliveIds = new Set(
      (alivePlayers ?? []).map(
        (player) => player.id,
      ),
    );

    const { data: wolfRoles } =
      await supabaseAdmin
        .from("player_roles")
        .select("player_id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("role", "werewolf");

    const aliveWerewolfCount = (
      wolfRoles ?? []
    ).filter((wolf) =>
      aliveIds.has(wolf.player_id),
    ).length;

    const { count: submittedCount } =
      await supabaseAdmin
        .from("night_actions")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "night_number",
          validation.room.night_number,
        )
        .eq("action_type", "kill");

    return NextResponse.json({
      success: true,
      submittedCount:
        submittedCount ?? 0,
      requiredCount:
        aliveWerewolfCount ||
        totalWerewolves ||
        0,
    });
  } catch (error) {
    console.error(
      "Submit Werewolf vote error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengirim vote.",
      },
      {
        status: 500,
      },
    );
  }
}