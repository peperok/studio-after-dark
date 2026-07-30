"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type GamePhase =
  | "lobby"
  | "role_reveal"
  | "night"
  | "morning"
  | "discussion"
  | "voting"
  | "result"
  | "game_over";

type Winner =
  | "village"
  | "werewolf"
  | null;

type RoomState = {
  id: string;
  code: string;
  phase: GamePhase;
  night_step: string | null;
  day_number: number;
  night_number: number;
  announcement: string;
  eliminated_player_name:
    | string
    | null;
  winner: Winner;
};

type Player = {
  id: string;
  nickname: string;
  is_alive: boolean;
  is_ready: boolean;
};

type DisplayContent = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function DisplayPage() {
  const params = useParams<{
    roomCode: string;
  }>();

  const roomCode =
    params.roomCode.toUpperCase();

  const [room, setRoom] =
    useState<RoomState | null>(null);

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const readyCount = useMemo(
    () =>
      players.filter(
        (player) => player.is_ready,
      ).length,
    [players],
  );

  const aliveCount = useMemo(
    () =>
      players.filter(
        (player) => player.is_alive,
      ).length,
    [players],
  );

  useEffect(() => {
    let roomChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    let playerChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    async function loadPlayers(
      currentRoomId: string,
    ) {
      const { data, error } =
        await supabase
          .from("players")
          .select(
            `
              id,
              nickname,
              is_alive,
              is_ready
            `,
          )
          .eq(
            "room_id",
            currentRoomId,
          )
          .order("created_at", {
            ascending: true,
          });

      if (error) {
        console.error(
          "Display players error:",
          error,
        );

        return;
      }

      setPlayers(
        (data ?? []) as Player[],
      );
    }

    async function setupDisplay() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: roomData,
        error: roomError,
      } = await supabase
        .from("rooms")
        .select(
          `
            id,
            code,
            phase,
            night_step,
            day_number,
            night_number,
            announcement,
            eliminated_player_name,
            winner
          `,
        )
        .eq("code", roomCode)
        .maybeSingle();

      if (roomError) {
        console.error(
          "Display room error:",
          roomError,
        );

        setErrorMessage(
          "Gagal mengambil data room.",
        );

        setIsLoading(false);
        return;
      }

      if (!roomData) {
        setErrorMessage(
          "Room tidak ditemukan.",
        );

        setIsLoading(false);
        return;
      }

      const currentRoom =
        roomData as RoomState;

      setRoom(currentRoom);

      await loadPlayers(
        currentRoom.id,
      );

      roomChannel = supabase
        .channel(
          `display-room-${currentRoom.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${currentRoom.id}`,
          },
          (payload) => {
            setRoom(
              payload.new as RoomState,
            );
          },
        )
        .subscribe((status) => {
          if (
            status ===
            "CHANNEL_ERROR"
          ) {
            console.error(
              "Display room realtime error.",
            );
          }
        });

      playerChannel = supabase
        .channel(
          `display-players-${currentRoom.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "players",
            filter: `room_id=eq.${currentRoom.id}`,
          },
          async () => {
            await loadPlayers(
              currentRoom.id,
            );
          },
        )
        .subscribe((status) => {
          if (
            status ===
            "CHANNEL_ERROR"
          ) {
            console.error(
              "Display players realtime error.",
            );
          }
        });

      setIsLoading(false);
    }

    setupDisplay();

    return () => {
      if (roomChannel) {
        supabase.removeChannel(
          roomChannel,
        );
      }

      if (playerChannel) {
        supabase.removeChannel(
          playerChannel,
        );
      }
    };
  }, [roomCode]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-xl text-slate-400">
          Loading display...
        </p>
      </main>
    );
  }

  if (!room || errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
            Studio After Dark
          </p>

          <h1 className="mt-5 text-5xl font-semibold">
            Display Unavailable
          </h1>

          <p className="mt-5 text-xl text-slate-400">
            {errorMessage ||
              "Room tidak ditemukan."}
          </p>
        </div>
      </main>
    );
  }

  const content =
    getDisplayContent(room);

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-slate-950 px-8 py-10 text-white md:px-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10rem] top-[-10rem] h-96 w-96 rounded-full bg-white/5 blur-3xl" />

        <div className="absolute bottom-[-12rem] right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col">
        <header className="flex items-start justify-between gap-6 border-b border-white/10 pb-7">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
              Studio After Dark
            </p>

            <p className="mt-3 text-lg text-slate-400">
              Room
            </p>

            <p className="mt-1 text-4xl font-semibold tracking-[0.22em]">
              {roomCode}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Players
            </p>

            <p className="mt-3 text-4xl font-semibold">
              {aliveCount}
              <span className="text-xl font-normal text-slate-500">
                {" "}
                alive
              </span>
            </p>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-5xl text-center">
            <p className="text-base uppercase tracking-[0.45em] text-slate-500 md:text-lg">
              {content.eyebrow}
            </p>

            <h1 className="mx-auto mt-7 max-w-5xl text-5xl font-semibold leading-tight md:text-7xl lg:text-8xl">
              {content.title}
            </h1>

            <p className="mx-auto mt-8 max-w-4xl text-xl leading-9 text-slate-300 md:text-3xl md:leading-[1.45]">
              {content.description}
            </p>

            {room.phase ===
              "role_reveal" && (
              <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7">
                <p className="text-lg text-slate-400">
                  Players Ready
                </p>

                <p className="mt-3 text-6xl font-semibold tabular-nums">
                  {readyCount}
                  <span className="text-3xl font-normal text-slate-500">
                    {" "}
                    / {players.length}
                  </span>
                </p>

                <p className="mt-4 text-lg text-slate-400">
                  {readyCount ===
                  players.length
                    ? "All players are ready. Waiting for the host."
                    : "Open your device privately and confirm your role."}
                </p>
              </div>
            )}

            {room.phase === "lobby" && (
              <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-7">
                <p className="text-lg text-slate-400">
                  Joined Players
                </p>

                <p className="mt-3 text-6xl font-semibold tabular-nums">
                  {players.length}
                </p>

                <p className="mt-4 text-lg text-slate-400">
                  Join using room code{" "}
                  <span className="font-semibold text-white">
                    {roomCode}
                  </span>
                </p>
              </div>
            )}

            {room.phase ===
              "game_over" && (
              <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
                  Winner
                </p>

                <p className="mt-4 text-5xl font-semibold capitalize">
                  {room.winner ===
                  "village"
                    ? "The Village"
                    : "The Werewolves"}
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>
            Day {room.day_number} · Night{" "}
            {room.night_number}
          </p>

          <p>
            Keep your role secret.
          </p>
        </footer>
      </div>
    </main>
  );
}

function getDisplayContent(
  room: RoomState,
): DisplayContent {
  if (room.phase === "lobby") {
    return {
      eyebrow: "Waiting Room",
      title: "Join the Village",
      description:
        "Open the join page on your phone and enter the room code.",
    };
  }

  if (
    room.phase === "role_reveal"
  ) {
    return {
      eyebrow: "Keep It Secret",
      title: "Check Your Role",
      description:
        "Open your device privately, reveal your role, then confirm when you are ready.",
    };
  }

  if (room.phase === "night") {
    if (
      room.night_step ===
      "werewolf"
    ) {
      return {
        eyebrow: `Night ${room.night_number}`,
        title: "Everyone, Close Your Eyes",
        description:
          "Werewolves, open your eyes and choose your target quietly.",
      };
    }

    if (
      room.night_step === "seer"
    ) {
      return {
        eyebrow: `Night ${room.night_number}`,
        title: "Keep Your Eyes Closed",
        description:
          "Seer, open your eyes and inspect one player.",
      };
    }

    if (
      room.night_step === "doctor"
    ) {
      return {
        eyebrow: `Night ${room.night_number}`,
        title: "Keep Your Eyes Closed",
        description:
          "Doctor, open your eyes and protect one player.",
      };
    }

    return {
      eyebrow: `Night ${room.night_number}`,
      title: "The Village Sleeps",
      description:
        "Keep your eyes closed and wait for the host's instruction.",
    };
  }

  if (room.phase === "morning") {
    return {
      eyebrow: `Day ${room.day_number}`,
      title:
        room.eliminated_player_name
          ? `${room.eliminated_player_name} Is Gone`
          : "Nobody Died",
      description:
        room.announcement ||
        "The village wakes up.",
    };
  }

  if (
    room.phase === "discussion"
  ) {
    return {
      eyebrow: `Day ${room.day_number}`,
      title: "Discussion Time",
      description:
        room.announcement ||
        "Share your suspicions. Who can you trust?",
    };
  }

  if (room.phase === "voting") {
    return {
      eyebrow: `Day ${room.day_number}`,
      title: "Cast Your Vote",
      description:
        "Open your device and choose the player you suspect.",
    };
  }

  if (room.phase === "result") {
    return {
      eyebrow: "Village Decision",
      title:
        room.eliminated_player_name
          ? `${room.eliminated_player_name} Was Eliminated`
          : "The Vote Was Tied",
      description:
        room.announcement ||
        "The village has made its decision.",
    };
  }

  if (
    room.phase === "game_over"
  ) {
    return {
      eyebrow: "Game Over",
      title:
        room.winner === "village"
          ? "The Village Wins"
          : "The Werewolves Win",
      description:
        room.announcement ||
        "The game has ended.",
    };
  }

  return {
    eyebrow: "Studio After Dark",
    title: "Please Wait",
    description:
      "Waiting for the next instruction.",
  };
}