import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Player = {
  id: string;
  nickname: string;
};

type Role =
  | "werewolf"
  | "seer"
  | "doctor"
  | "villager";

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1),
    );

    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function getRoleComposition(playerCount: number) {
  let werewolfCount = 1;

  if (playerCount >= 7 && playerCount <= 10) {
    werewolfCount = 2;
  } else if (
    playerCount >= 11 &&
    playerCount <= 14
  ) {
    werewolfCount = 3;
  } else if (playerCount >= 15) {
    werewolfCount = 4;
  }

  const seerCount = 1;
  const doctorCount = 1;

  const villagerCount =
    playerCount -
    werewolfCount -
    seerCount -
    doctorCount;

  return {
    werewolfCount,
    seerCount,
    doctorCount,
    villagerCount,
  };
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
    const { roomCode } = await context.params;
    const cleanRoomCode =
      roomCode.trim().toUpperCase();

    const { data: room, error: roomError } =
      await supabaseAdmin
        .from("rooms")
        .select("id, code, status")
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

    const { data: players, error: playersError } =
      await supabaseAdmin
        .from("players")
        .select("id, nickname")
        .eq("room_id", room.id)
        .order("created_at", {
          ascending: true,
        });

    if (playersError) {
      console.error(playersError);

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

    const playerList = (players ?? []) as Player[];

    if (playerList.length < 5) {
      return NextResponse.json(
        {
          error:
            "Minimal 5 pemain untuk membagikan role.",
        },
        {
          status: 400,
        },
      );
    }

    const composition = getRoleComposition(
      playerList.length,
    );

    if (composition.villagerCount < 1) {
      return NextResponse.json(
        {
          error:
            "Komposisi role tidak valid.",
        },
        {
          status: 400,
        },
      );
    }

    const roles: Role[] = [
      ...Array<Role>(
        composition.werewolfCount,
      ).fill("werewolf"),
      ...Array<Role>(
        composition.seerCount,
      ).fill("seer"),
      ...Array<Role>(
        composition.doctorCount,
      ).fill("doctor"),
      ...Array<Role>(
        composition.villagerCount,
      ).fill("villager"),
    ];

    const shuffledPlayers =
      shuffleArray(playerList);

    const shuffledRoles = shuffleArray(roles);

    const assignments = shuffledPlayers.map(
      (player, index) => ({
        room_id: room.id,
        player_id: player.id,
        role: shuffledRoles[index],
      }),
    );

    // Hapus pembagian sebelumnya saat rematch.
    const { error: deleteError } =
      await supabaseAdmin
        .from("player_roles")
        .delete()
        .eq("room_id", room.id);

    if (deleteError) {
      console.error(deleteError);

      return NextResponse.json(
        {
          error:
            "Gagal menghapus role sebelumnya.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: roleError } =
      await supabaseAdmin
        .from("player_roles")
        .insert(assignments);

    if (roleError) {
      console.error(roleError);

      return NextResponse.json(
        {
          error: "Gagal menyimpan role.",
        },
        {
          status: 500,
        },
      );
    }

    const { error: playerUpdateError } =
      await supabaseAdmin
        .from("players")
        .update({
          is_alive: true,
          is_ready: false,
        })
        .eq("room_id", room.id);

    if (playerUpdateError) {
      console.error(playerUpdateError);
    }

    const { error: roomUpdateError } =
      await supabaseAdmin
        .from("rooms")
        .update({
          status: "playing",
          phase: "role_reveal",
          day_number: 1,
          announcement:
            "Check your role privately.",
          eliminated_player_name: null,
          winner: null,
        })
        .eq("id", room.id);

    if (roomUpdateError) {
      console.error(roomUpdateError);

      return NextResponse.json(
        {
          error:
            "Role tersimpan, tetapi fase room gagal diperbarui.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      playerCount: playerList.length,
      composition,
    });
  } catch (error) {
    console.error("Assign roles error:", error);

    return NextResponse.json(
      {
        error:
          "Terjadi kesalahan saat membagikan role.",
      },
      {
        status: 500,
      },
    );
  }
}