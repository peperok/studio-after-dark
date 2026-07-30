import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RequestBody = {
  playerId?: string;
  playerToken?: string;
  targetPlayerId?: string;
};

type PlayerRow = {
  id: string;
  room_id: string;
  nickname: string;
  player_token: string;
  is_alive: boolean;
};

type RoomRow = {
  id: string;
  phase: string;
  night_step: string | null;
  night_number: number;
};

async function validateWerewolf(
  playerId: string,
  playerToken: string,
): Promise<{
  error: string | null;
  player: PlayerRow | null;
  room: RoomRow | null;
}> {
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
    console.error(
      "Validate Werewolf player error:",
      playerError,
    );

    return {
      error:
        "Session pemain tidak valid atau pemain sudah tereliminasi.",
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
    console.error(
      "Validate Werewolf role error:",
      roleError,
    );

    return {
      error: "Pemain ini bukan Werewolf.",
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
    room.night_step !== "werewolf"
  ) {
    console.error(
      "Validate Werewolf room error:",
      roomError,
    );

    return {
      error:
        "Saat ini bukan giliran Werewolf.",
      player: null,
      room: null,
    };
  }

  return {
    error: null,
    player: player as PlayerRow,
    room: room as RoomRow,
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

    const { data: wolfRoles, error: wolfRoleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("player_id")
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("role", "werewolf");

    if (wolfRoleError) {
      console.error(
        "Get Werewolf IDs error:",
        wolfRoleError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal mengambil daftar Werewolf.",
        },
        {
          status: 500,
        },
      );
    }

    const werewolfIds = new Set(
      (wolfRoles ?? []).map(
        (item) => item.player_id,
      ),
    );

    const { data: alivePlayers, error: playerError } =
      await supabaseAdmin
        .from("players")
        .select(
          `
            id,
            nickname,
            created_at
          `,
        )
        .eq(
          "room_id",
          validation.player.room_id,
        )
        .eq("is_alive", true)
        .order("created_at", {
          ascending: true,
        });

    if (playerError) {
      console.error(
        "Get Werewolf targets error:",
        playerError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal mengambil target Werewolf.",
        },
        {
          status: 500,
        },
      );
    }

    const targets = (alivePlayers ?? [])
      .filter(
        (player) =>
          !werewolfIds.has(player.id),
      )
      .map((player) => ({
        id: player.id,
        nickname: player.nickname,
      }));

    const { data: existingAction, error: existingError } =
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

    if (existingError) {
      console.error(
        "Get existing Werewolf action error:",
        existingError,
      );
    }

    return NextResponse.json({
      success: true,
      targets,
      selectedTargetId:
        existingAction?.target_player_id ??
        null,
    });
  } catch (error) {
    console.error(
      "Get Werewolf targets unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengambil target Werewolf.",
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
            "Data vote Werewolf belum lengkap.",
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
        .select(
          `
            id,
            room_id,
            nickname,
            is_alive
          `,
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

    const { data: targetRole, error: targetRoleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("role")
        .eq("player_id", target.id)
        .single();

    if (targetRoleError) {
      console.error(
        "Get target role error:",
        targetRoleError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal memeriksa target.",
        },
        {
          status: 500,
        },
      );
    }

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
            room_id:
              validation.room.id,
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
      console.error(
        "Save Werewolf vote error:",
        actionError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal menyimpan vote Werewolf.",
        },
        {
          status: 500,
        },
      );
    }

    const { data: wolfRoles, error: wolfRoleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("player_id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("role", "werewolf");

    if (wolfRoleError) {
      console.error(
        "Count Werewolves error:",
        wolfRoleError,
      );
    }

    const { data: alivePlayers, error: aliveError } =
      await supabaseAdmin
        .from("players")
        .select("id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("is_alive", true);

    if (aliveError) {
      console.error(
        "Get alive players error:",
        aliveError,
      );
    }

    const aliveIds = new Set(
      (alivePlayers ?? []).map(
        (player) => player.id,
      ),
    );

    const aliveWerewolfIds = (
      wolfRoles ?? []
    )
      .map((wolf) => wolf.player_id)
      .filter((id) => aliveIds.has(id));

    const { data: submittedActions, error: submittedError } =
      await supabaseAdmin
        .from("night_actions")
        .select("actor_player_id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "night_number",
          validation.room.night_number,
        )
        .eq("action_type", "kill");

    if (submittedError) {
      console.error(
        "Count Werewolf votes error:",
        submittedError,
      );
    }

    const submittedAliveWerewolves =
      new Set(
        (submittedActions ?? [])
          .map(
            (action) =>
              action.actor_player_id,
          )
          .filter((id) =>
            aliveWerewolfIds.includes(id),
          ),
      );

    return NextResponse.json({
      success: true,
      targetName: target.nickname,
      submittedCount:
        submittedAliveWerewolves.size,
      requiredCount:
        aliveWerewolfIds.length,
    });
  } catch (error) {
    console.error(
      "Submit Werewolf vote unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengirim vote Werewolf.",
      },
      {
        status: 500,
      },
    );
  }
}