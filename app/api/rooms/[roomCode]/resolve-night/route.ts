import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type NightAction = {
  action_type: "kill" | "protect";
  target_player_id: string;
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
            code,
            night_number,
            day_number
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

    const { data: actions, error: actionError } =
      await supabaseAdmin
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

    if (actionError) {
      console.error(
        "Resolve actions error:",
        actionError,
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
      (actions ?? []) as NightAction[];

    const killVotes = nightActions.filter(
      (action) =>
        action.action_type === "kill",
    );

    const protectAction =
      nightActions.find(
        (action) =>
          action.action_type === "protect",
      );

    const voteCounts = new Map<
      string,
      number
    >();

    for (const vote of killVotes) {
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

    let attackedPlayerId: string | null =
      null;

    let isTie = false;

    if (sortedVotes.length > 0) {
      attackedPlayerId =
        sortedVotes[0][0];

      if (
        sortedVotes.length > 1 &&
        sortedVotes[0][1] ===
          sortedVotes[1][1]
      ) {
        isTie = true;
        attackedPlayerId = null;
      }
    }

    const protectedPlayerId =
      protectAction?.target_player_id ??
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
        error: playerError,
      } = await supabaseAdmin
        .from("players")
        .select("id, nickname")
        .eq("id", eliminatedPlayerId)
        .single();

      if (
        playerError ||
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

      const { error: eliminateError } =
        await supabaseAdmin
          .from("players")
          .update({
            is_alive: false,
          })
          .eq("id", eliminatedPlayerId);

      if (eliminateError) {
        console.error(
          "Eliminate player error:",
          eliminateError,
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
    }

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
    } else if (eliminatedPlayerName) {
      announcement =
        `${eliminatedPlayerName} was eliminated during the night.`;
    }

    const { error: roomUpdateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          phase: "morning",
          night_step: null,
          announcement,
          eliminated_player_name:
            eliminatedPlayerName,
        })
        .eq("id", room.id);

    if (roomUpdateError) {
      console.error(
        "Resolve room error:",
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
      wasProtected:
        Boolean(
          attackedPlayerId &&
            attackedPlayerId ===
              protectedPlayerId,
        ),
      eliminatedPlayerName,
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