import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  GameRole,
  getRoleComposition,
} from "@/lib/game-rules";

type Player = {
  id: string;
  nickname: string;
};

function shuffleArray<T>(
  items: T[],
): T[] {
  const shuffled = [...items];

  for (
    let index =
      shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
          (index + 1),
      );

    [
      shuffled[index],
      shuffled[randomIndex],
    ] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

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
      .select("id, code")
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
      data: players,
      error: playersError,
    } = await supabaseAdmin
      .from("players")
      .select(
        "id, nickname",
      )
      .eq("room_id", room.id)
      .order("created_at", {
        ascending: true,
      });

    if (playersError) {
      console.error(
        "Assign roles players error:",
        playersError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal mengambil pemain.",
        },
        {
          status: 500,
        },
      );
    }

    const playerList =
      (players ?? []) as Player[];

    if (
      playerList.length < 5 ||
      playerList.length > 15
    ) {
      return NextResponse.json(
        {
          error:
            "Jumlah pemain harus 5 sampai 15.",
        },
        {
          status: 400,
        },
      );
    }

    const composition =
      getRoleComposition(
        playerList.length,
      );

    const roles: GameRole[] = [
      ...Array<GameRole>(
        composition.werewolfCount,
      ).fill("werewolf"),

      ...Array<GameRole>(
        composition.seerCount,
      ).fill("seer"),

      ...Array<GameRole>(
        composition.doctorCount,
      ).fill("doctor"),

      ...Array<GameRole>(
        composition.villagerCount,
      ).fill("villager"),
    ];

    const shuffledPlayers =
      shuffleArray(playerList);

    const shuffledRoles =
      shuffleArray(roles);

    const assignments =
      shuffledPlayers.map(
        (player, index) => ({
          room_id: room.id,
          player_id:
            player.id,
          role:
            shuffledRoles[index],
        }),
      );

    await supabaseAdmin
      .from("night_actions")
      .delete()
      .eq("room_id", room.id);

    await supabaseAdmin
      .from("day_votes")
      .delete()
      .eq("room_id", room.id);

    const {
      error: deleteRoleError,
    } = await supabaseAdmin
      .from("player_roles")
      .delete()
      .eq("room_id", room.id);

    if (deleteRoleError) {
      console.error(
        "Delete roles error:",
        deleteRoleError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal membersihkan role lama.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      error: insertRoleError,
    } = await supabaseAdmin
      .from("player_roles")
      .insert(assignments);

    if (insertRoleError) {
      console.error(
        "Insert roles error:",
        insertRoleError,
      );

      return NextResponse.json(
        {
          error:
            "Gagal membagikan role.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      error: playerUpdateError,
    } = await supabaseAdmin
      .from("players")
      .update({
        is_alive: true,
        is_ready: false,
      })
      .eq("room_id", room.id);

    if (playerUpdateError) {
      console.error(
        "Reset players error:",
        playerUpdateError,
      );
    }

    const {
      error: roomUpdateError,
    } = await supabaseAdmin
      .from("rooms")
      .update({
        status: "playing",
        phase: "role_reveal",
        night_step: null,
        day_number: 1,
        night_number: 1,
        announcement:
          "Check your role privately.",
        eliminated_player_name:
          null,
        winner: null,
      })
      .eq("id", room.id);

    if (roomUpdateError) {
      console.error(
        "Update room error:",
        roomUpdateError,
      );

      return NextResponse.json(
        {
          error:
            "Role dibagikan, tetapi room gagal diperbarui.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      playerCount:
        playerList.length,
      composition,
    });
  } catch (error) {
    console.error(
      "Assign roles error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat membagikan role.",
      },
      {
        status: 500,
      },
    );
  }
}