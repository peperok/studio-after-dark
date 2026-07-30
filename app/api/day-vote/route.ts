import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type VoteBody = {
  playerId?: string;
  playerToken?: string;
  targetPlayerId?: string;
};

async function validateVoter(
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
      error:
        "Session pemain tidak valid atau pemain sudah tereliminasi.",
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
          day_number
        `,
      )
      .eq("id", player.room_id)
      .single();

  if (
    roomError ||
    !room ||
    room.phase !== "voting"
  ) {
    return {
      error:
        "Voting belum dimulai atau sudah selesai.",
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
      (await request.json()) as VoteBody;

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
      await validateVoter(
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
        .neq(
          "id",
          validation.player.id,
        )
        .order("created_at", {
          ascending: true,
        });

    if (targetError) {
      console.error(targetError);

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

    const { data: existingVote } =
      await supabaseAdmin
        .from("day_votes")
        .select("target_player_id")
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "day_number",
          validation.room.day_number,
        )
        .eq(
          "voter_player_id",
          validation.player.id,
        )
        .maybeSingle();

    const { count: submittedCount } =
      await supabaseAdmin
        .from("day_votes")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "day_number",
          validation.room.day_number,
        );

    const { count: aliveCount } =
      await supabaseAdmin
        .from("players")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("is_alive", true);

    return NextResponse.json({
      targets: targets ?? [],
      selectedTargetId:
        existingVote?.target_player_id ??
        null,
      submittedCount:
        submittedCount ?? 0,
      requiredCount: aliveCount ?? 0,
    });
  } catch (error) {
    console.error(
      "Get vote targets error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengambil target voting.",
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
      (await request.json()) as VoteBody;

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
            "Data voting belum lengkap.",
        },
        {
          status: 400,
        },
      );
    }

    const validation =
      await validateVoter(
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
            "Kamu tidak bisa memilih diri sendiri.",
        },
        {
          status: 400,
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
            "Target voting tidak tersedia.",
        },
        {
          status: 400,
        },
      );
    }

    const { error: voteError } =
      await supabaseAdmin
        .from("day_votes")
        .upsert(
          {
            room_id:
              validation.room.id,
            day_number:
              validation.room.day_number,
            voter_player_id:
              validation.player.id,
            target_player_id:
              targetPlayerId,
          },
          {
            onConflict:
              "room_id,day_number,voter_player_id",
          },
        );

    if (voteError) {
      console.error(voteError);

      return NextResponse.json(
        {
          error:
            "Gagal menyimpan voting.",
        },
        {
          status: 500,
        },
      );
    }

    const { count: submittedCount } =
      await supabaseAdmin
        .from("day_votes")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq(
          "day_number",
          validation.room.day_number,
        );

    const { count: aliveCount } =
      await supabaseAdmin
        .from("players")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "room_id",
          validation.room.id,
        )
        .eq("is_alive", true);

    return NextResponse.json({
      success: true,
      submittedCount:
        submittedCount ?? 0,
      requiredCount:
        aliveCount ?? 0,
    });
  } catch (error) {
    console.error(
      "Submit vote error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat mengirim voting.",
      },
      {
        status: 500,
      },
    );
  }
}