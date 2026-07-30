import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  determineWinner,
  GameRole,
} from "@/lib/game-rules";

type VoteRow = {
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
          day_number,
          night_number
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
      data: votes,
      error: votesError,
    } = await supabaseAdmin
      .from("day_votes")
      .select(
        "target_player_id",
      )
      .eq("room_id", room.id)
      .eq(
        "day_number",
        room.day_number,
      );

    if (votesError) {
      return NextResponse.json(
        {
          error:
            "Gagal mengambil voting.",
        },
        {
          status: 500,
        },
      );
    }

    const voteRows =
      (votes ?? []) as VoteRow[];

    if (
      voteRows.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Belum ada voting yang masuk.",
        },
        {
          status: 400,
        },
      );
    }

    const voteCounts =
      new Map<string, number>();

    for (
      const vote of voteRows
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

    const highestCount =
      sortedVotes[0][1];

    const tiedPlayers =
      sortedVotes.filter(
        ([, count]) =>
          count ===
          highestCount,
      );

    if (
      tiedPlayers.length > 1
    ) {
      const announcement =
        "The vote ended in a tie. Nobody was eliminated.";

      const {
        error: tieError,
      } = await supabaseAdmin
        .from("rooms")
        .update({
          phase: "result",
          announcement,
          eliminated_player_name:
            null,
        })
        .eq("id", room.id);

      if (tieError) {
        return NextResponse.json(
          {
            error:
              "Gagal menyimpan hasil seri.",
          },
          {
            status: 500,
          },
        );
      }

      return NextResponse.json({
        success: true,
        isTie: true,
        winner: null,
        eliminatedPlayerName:
          null,
        announcement,
      });
    }

    const eliminatedPlayerId =
      sortedVotes[0][0];

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
      .eq("room_id", room.id)
      .eq("is_alive", true)
      .single();

    if (
      eliminatedPlayerError ||
      !eliminatedPlayer
    ) {
      return NextResponse.json(
        {
          error:
            "Pemain eliminasi tidak ditemukan.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      error: eliminateError,
    } = await supabaseAdmin
      .from("players")
      .update({
        is_alive: false,
      })
      .eq(
        "id",
        eliminatedPlayer.id,
      );

    if (eliminateError) {
      return NextResponse.json(
        {
          error:
            "Gagal mengeliminasi pemain.",
        },
        {
          status: 500,
        },
      );
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
            "Gagal mengambil role.",
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

    const eliminatedRole =
      roleRows.find(
        (item) =>
          item.player_id ===
          eliminatedPlayer.id,
      )?.role ?? null;

    let announcement =
      `${eliminatedPlayer.nickname} was eliminated by the village.`;

    if (eliminatedRole) {
      announcement +=
        ` Their role was ${eliminatedRole}.`;
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
      error: roomUpdateError,
    } = await supabaseAdmin
      .from("rooms")
      .update({
        status: winner
          ? "finished"
          : "playing",

        phase: winner
          ? "game_over"
          : "result",

        announcement,

        eliminated_player_name:
          eliminatedPlayer.nickname,

        winner,
      })
      .eq("id", room.id);

    if (roomUpdateError) {
      return NextResponse.json(
        {
          error:
            "Hasil voting gagal disimpan.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      isTie: false,
      eliminatedPlayerName:
        eliminatedPlayer.nickname,
      eliminatedRole,
      aliveWerewolfCount,
      aliveGoodCount,
      winner,
      announcement,
    });
  } catch (error) {
    console.error(
      "Resolve voting error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat resolve voting.",
      },
      {
        status: 500,
      },
    );
  }
}