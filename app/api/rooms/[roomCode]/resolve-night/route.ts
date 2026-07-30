import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type NightAction = {
  action_type: "kill" | "protect";
  target_player_id: string;
};

type RoleRow = {
  player_id: string;
  role: "werewolf" | "seer" | "doctor" | "villager";
};

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
        .select("id, night_number, day_number")
        .eq("code", cleanRoomCode)
        .single();

    if (roomError || !room) {
      console.error("Resolve night room error:", roomError);

      return NextResponse.json(
        {
          error: "Room tidak ditemukan.",
        },
        {
          status: 404,
        },
      );
    }

    const { data: actions, error: actionError } =
      await supabaseAdmin
        .from("night_actions")
        .select("action_type, target_player_id")
        .eq("room_id", room.id)
        .eq("night_number", room.night_number)
        .in("action_type", ["kill", "protect"]);

    if (actionError) {
      console.error("Resolve night actions error:", actionError);

      return NextResponse.json(
        {
          error: "Gagal mengambil hasil malam.",
        },
        {
          status: 500,
        },
      );
    }

    const nightActions = (actions ?? []) as NightAction[];

    const killVotes = nightActions.filter(
      (action) => action.action_type === "kill",
    );

    const protectAction = nightActions.find(
      (action) => action.action_type === "protect",
    );

    const voteCounts = new Map<string, number>();

    for (const vote of killVotes) {
      const currentCount =
        voteCounts.get(vote.target_player_id) ?? 0;

      voteCounts.set(
        vote.target_player_id,
        currentCount + 1,
      );
    }

    const sortedVotes = Array.from(
      voteCounts.entries(),
    ).sort(
      (first, second) => second[1] - first[1],
    );

    let attackedPlayerId: string | null = null;
    let isTie = false;

    if (sortedVotes.length > 0) {
      attackedPlayerId = sortedVotes[0][0];

      if (
        sortedVotes.length > 1 &&
        sortedVotes[0][1] === sortedVotes[1][1]
      ) {
        isTie = true;
        attackedPlayerId = null;
      }
    }

    const protectedPlayerId =
      protectAction?.target_player_id ?? null;

    let eliminatedPlayerId: string | null = null;
    let eliminatedPlayerName: string | null = null;

    if (
      attackedPlayerId &&
      attackedPlayerId !== protectedPlayerId
    ) {
      eliminatedPlayerId = attackedPlayerId;
    }

    if (eliminatedPlayerId) {
      const {
        data: eliminatedPlayer,
        error: eliminatedPlayerError,
      } = await supabaseAdmin
        .from("players")
        .select("id, nickname")
        .eq("id", eliminatedPlayerId)
        .single();

      if (
        eliminatedPlayerError ||
        !eliminatedPlayer
      ) {
        console.error(
          "Resolve night eliminated player error:",
          eliminatedPlayerError,
        );

        return NextResponse.json(
          {
            error: "Korban malam tidak ditemukan.",
          },
          {
            status: 500,
          },
        );
      }

      eliminatedPlayerName =
        eliminatedPlayer.nickname;

      const { error: eliminateError } =
        await supabaseAdmin
          .from("players")
          .update({
            is_alive: false,
          })
          .eq("id", eliminatedPlayer.id);

      if (eliminateError) {
        console.error(
          "Resolve night eliminate error:",
          eliminateError,
        );

        return NextResponse.json(
          {
            error: "Gagal mengeliminasi pemain.",
          },
          {
            status: 500,
          },
        );
      }
    }

    // Ambil semua pemain yang masih hidup setelah hasil malam.
    const {
      data: alivePlayers,
      error: alivePlayersError,
    } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_id", room.id)
      .eq("is_alive", true);

    if (alivePlayersError) {
      console.error(
        "Resolve night alive players error:",
        alivePlayersError,
      );

      return NextResponse.json(
        {
          error: "Gagal mengecek pemain yang masih hidup.",
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
      .select("player_id, role")
      .eq("room_id", room.id);

    if (rolesError) {
      console.error(
        "Resolve night roles error:",
        rolesError,
      );

      return NextResponse.json(
        {
          error: "Gagal mengecek kondisi kemenangan.",
        },
        {
          status: 500,
        },
      );
    }

    const aliveIds = new Set(
      (alivePlayers ?? []).map(
        (player) => player.id,
      ),
    );

    const roleRows = (roles ?? []) as RoleRow[];

    const aliveWerewolfCount =
      roleRows.filter(
        (role) =>
          role.role === "werewolf" &&
          aliveIds.has(role.player_id),
      ).length;

    const aliveGoodCount =
      aliveIds.size - aliveWerewolfCount;

    let winner:
      | "village"
      | "werewolf"
      | null = null;

    // Village menang bila semua Werewolf mati.
    if (aliveWerewolfCount === 0) {
      winner = "village";
    }

    // Werewolf menang bila jumlah mereka sama atau lebih banyak.
    if (
      aliveWerewolfCount > 0 &&
      aliveWerewolfCount >= aliveGoodCount
    ) {
      winner = "werewolf";
    }

    let announcement =
      "The village wakes up. Nobody died last night.";

    if (isTie) {
      announcement =
        "The Werewolves could not agree. Nobody died last night.";
    } else if (
      attackedPlayerId &&
      attackedPlayerId === protectedPlayerId
    ) {
      announcement =
        "The Doctor saved someone. Nobody died last night.";
    } else if (eliminatedPlayerName) {
      announcement =
        `${eliminatedPlayerName} was eliminated during the night.`;
    }

    if (winner === "village") {
      announcement += " The Village wins!";
    }

    if (winner === "werewolf") {
      announcement += " The Werewolves win!";
    }

    const nextPhase =
      winner ? "game_over" : "morning";

    const { error: roomUpdateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          status: winner ? "finished" : "playing",
          phase: nextPhase,
          night_step: null,
          announcement,
          eliminated_player_name:
            eliminatedPlayerName,
          winner,
        })
        .eq("id", room.id);

    if (roomUpdateError) {
      console.error(
        "Resolve night room update error:",
        roomUpdateError,
      );

      return NextResponse.json(
        {
          error:
            "Hasil malam selesai, tetapi room gagal diperbarui.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      isTie,
      wasProtected: Boolean(
        attackedPlayerId &&
          attackedPlayerId === protectedPlayerId,
      ),
      eliminatedPlayerName,
      aliveWerewolfCount,
      aliveGoodCount,
      winner,
      announcement,
    });
  } catch (error) {
    console.error(
      "Resolve night unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyelesaikan malam.",
      },
      {
        status: 500,
      },
    );
  }
}