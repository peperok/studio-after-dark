import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  determineWinner,
  GameRole,
} from "@/lib/game-rules";

type NightAction = {
  action_type:
    | "kill"
    | "protect";
  target_player_id: string;
};

type RoleRow = {
  player_id: string;
  role: GameRole;
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
      .select(
        `
          id,
          night_number,
          day_number
        `,
      )
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
      data: actions,
      error: actionsError,
    } = await supabaseAdmin
      .from("night_actions")
      .select(
        `
          action_type,
          target_player_id
        `,
      )
      .eq("room_id", room.id)
      .eq(
        "night_number",
        room.night_number,
      )
      .in("action_type", [
        "kill",
        "protect",
      ]);

    if (actionsError) {
      console.error(
        "Resolve night actions:",
        actionsError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal mengambil hasil malam.",
        },
        {
          status: 500,
        },
      );
    }

    const nightActions =
      (actions ??
        []) as NightAction[];

    const killVotes =
      nightActions.filter(
        (action) =>
          action.action_type ===
          "kill",
      );

    const protectAction =
      nightActions.find(
        (action) =>
          action.action_type ===
          "protect",
      );

    const voteCounts =
      new Map<string, number>();

    for (
      const vote of killVotes
    ) {
      voteCounts.set(
        vote.target_player_id,
        (voteCounts.get(
          vote.target_player_id,
        ) ?? 0) + 1,
      );
    }

    const sortedVotes =
      Array.from(
        voteCounts.entries(),
      ).sort(
        (first, second) =>
          second[1] -
          first[1],
      );

    let attackedPlayerId:
      | string
      | null = null;

    let isTie = false;

    if (
      sortedVotes.length > 0
    ) {
      attackedPlayerId =
        sortedVotes[0][0];

      if (
        sortedVotes.length > 1 &&
        sortedVotes[0][1] ===
          sortedVotes[1][1]
      ) {
        attackedPlayerId =
          null;

        isTie = true;
      }
    }

    const protectedPlayerId =
      protectAction
        ?.target_player_id ??
      null;

    let eliminatedPlayerId:
      | string
      | null = null;

    if (
      attackedPlayerId &&
      attackedPlayerId !==
        protectedPlayerId
    ) {
      eliminatedPlayerId =
        attackedPlayerId;
    }

    let eliminatedPlayerName:
      | string
      | null = null;

    if (eliminatedPlayerId) {
      const {
        data: eliminatedPlayer,
        error:
          eliminatedPlayerError,
      } = await supabaseAdmin
        .from("players")
        .select(
          "id, nickname",
        )
        .eq(
          "id",
          eliminatedPlayerId,
        )
        .single();

      if (
        eliminatedPlayerError ||
        !eliminatedPlayer
      ) {
        return NextResponse.json(
          {
            error:
              "Korban malam tidak ditemukan.",
          },
          {
            status: 500,
          },
        );
      }

      eliminatedPlayerName =
        eliminatedPlayer.nickname;

      const {
        error: eliminateError,
      } = await supabaseAdmin
        .from("players")
        .update({
          is_alive: false,
        })
        .eq(
          "id",
          eliminatedPlayerId,
        );

      if (eliminateError) {
        return NextResponse.json(
          {
            error:
              "Gagal mengeliminasi korban.",
          },
          {
            status: 500,
          },
        );
      }
    }

    const {
      data: alivePlayers,
      error: aliveError,
    } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_id", room.id)
      .eq("is_alive", true);

    if (aliveError) {
      return NextResponse.json(
        {
          error:
            "Gagal mengecek pemain hidup.",
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
      return NextResponse.json(
        {
          error:
            "Gagal mengecek role.",
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

    const roleRows =
      (roles ??
        []) as RoleRow[];

    const aliveWerewolfCount =
      roleRows.filter(
        (item) =>
          item.role ===
            "werewolf" &&
          aliveIds.has(
            item.player_id,
          ),
      ).length;

    const aliveGoodCount =
      aliveIds.size -
      aliveWerewolfCount;

    const winner =
      determineWinner({
        aliveWerewolfCount,
        aliveGoodCount,
      });

    let announcement =
      "The village wakes up. Nobody died last night.";

    if (isTie) {
      announcement =
        "The Werewolves could not agree. Nobody died last night.";
    } else if (
      attackedPlayerId &&
      attackedPlayerId ===
        protectedPlayerId
    ) {
      announcement =
        "The Doctor saved someone. Nobody died last night.";
    } else if (
      eliminatedPlayerName
    ) {
      announcement =
        `${eliminatedPlayerName} was eliminated during the night.`;
    }

    if (
      winner === "village"
    ) {
      announcement +=
        " The Village wins!";
    }

    if (
      winner === "werewolf"
    ) {
      announcement +=
        " The Werewolves win!";
    }

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("rooms")
      .update({
        status: winner
          ? "finished"
          : "playing",

        phase: winner
          ? "game_over"
          : "morning",

        night_step: null,

        announcement,

        eliminated_player_name:
          eliminatedPlayerName,

        winner,
      })
      .eq("id", room.id);

    if (updateError) {
      console.error(
        "Resolve night room error:",
        updateError,
      );

      return NextResponse.json(
        {
          error:
            "Hasil malam gagal disimpan.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      isTie,
      wasProtected:
        Boolean(
          attackedPlayerId &&
            attackedPlayerId ===
              protectedPlayerId,
        ),
      eliminatedPlayerName,
      aliveWerewolfCount,
      aliveGoodCount,
      winner,
      announcement,
    });
  } catch (error) {
    console.error(
      "Resolve night error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat resolve malam.",
      },
      {
        status: 500,
      },
    );
  }
}