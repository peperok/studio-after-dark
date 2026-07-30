import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type VoteRow = {
  target_player_id: string;
};

type RoleRow = {
  player_id: string;
  role: string;
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

    const cleanRoomCode = roomCode
      .trim()
      .toUpperCase();

    const { data: room, error: roomError } =
      await supabaseAdmin
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

    const { data: votes, error: voteError } =
      await supabaseAdmin
        .from("day_votes")
        .select("target_player_id")
        .eq("room_id", room.id)
        .eq(
          "day_number",
          room.day_number,
        );

    if (voteError) {
      console.error(voteError);

      return NextResponse.json(
        {
          error:
            "Gagal mengambil hasil voting.",
        },
        {
          status: 500,
        },
      );
    }

    const voteRows =
      (votes ?? []) as VoteRow[];

    if (voteRows.length === 0) {
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

    const voteCounts = new Map<
      string,
      number
    >();

    for (const vote of voteRows) {
      const currentCount =
        voteCounts.get(
          vote.target_player_id,
        ) ?? 0;

      voteCounts.set(
        vote.target_player_id,
        currentCount + 1,
      );
    }

    const sortedVotes = Array.from(
      voteCounts.entries(),
    ).sort(
      (first, second) =>
        second[1] - first[1],
    );

    const highestCount =
      sortedVotes[0][1];

    const tiedPlayers =
      sortedVotes.filter(
        ([, count]) =>
          count === highestCount,
      );

    if (tiedPlayers.length > 1) {
      const announcement =
        "The vote ended in a tie. Nobody was eliminated.";

      const { error: tieUpdateError } =
        await supabaseAdmin
          .from("rooms")
          .update({
            phase: "result",
            announcement,
            eliminated_player_name:
              null,
          })
          .eq("id", room.id);

      if (tieUpdateError) {
        console.error(
          tieUpdateError,
        );

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
        eliminatedPlayerName: null,
        announcement,
      });
    }

    const eliminatedPlayerId =
      sortedVotes[0][0];

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
      return NextResponse.json(
        {
          error:
            "Pemain yang dieliminasi tidak ditemukan.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: eliminationError } =
      await supabaseAdmin
        .from("players")
        .update({
          is_alive: false,
        })
        .eq("id", eliminatedPlayer.id);

    if (eliminationError) {
      console.error(
        eliminationError,
      );

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

    const { data: alivePlayers } =
      await supabaseAdmin
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .eq("is_alive", true);

    const aliveIds = new Set(
      (alivePlayers ?? []).map(
        (player) => player.id,
      ),
    );

    const { data: roles, error: roleError } =
      await supabaseAdmin
        .from("player_roles")
        .select("player_id, role")
        .eq("room_id", room.id);

    if (roleError) {
      console.error(roleError);

      return NextResponse.json(
        {
          error:
            "Gagal memeriksa kondisi kemenangan.",
        },
        {
          status: 500,
        },
      );
    }

    const roleRows =
      (roles ?? []) as RoleRow[];

    const aliveWerewolves =
      roleRows.filter(
        (role) =>
          role.role === "werewolf" &&
          aliveIds.has(role.player_id),
      ).length;

    const aliveVillage =
      aliveIds.size -
      aliveWerewolves;

    let winner:
      | "village"
      | "werewolf"
      | null = null;

    if (aliveWerewolves === 0) {
      winner = "village";
    } else if (
      aliveWerewolves >= aliveVillage
    ) {
      winner = "werewolf";
    }

    const eliminatedRole =
      roleRows.find(
        (role) =>
          role.player_id ===
          eliminatedPlayer.id,
      )?.role ?? null;

    let announcement =
      `${eliminatedPlayer.nickname} was eliminated by the village.`;

    if (eliminatedRole) {
      announcement +=
        ` Their role was ${eliminatedRole}.`;
    }

    if (winner === "village") {
      announcement +=
        " The Village wins!";
    }

    if (winner === "werewolf") {
      announcement +=
        " The Werewolves win!";
    }

    const { error: roomUpdateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
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
      console.error(
        roomUpdateError,
      );

      return NextResponse.json(
        {
          error:
            "Pemain tereliminasi, tetapi room gagal diperbarui.",
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
          "Terjadi kesalahan saat menyelesaikan voting.",
      },
      {
        status: 500,
      },
    );
  }
}