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

type GameSettings = {
  roomId?: string;
  roomCode: string;
  discussionSeconds: number;
  nightSeconds: number;
  votingSeconds: number;
  revealRole: boolean;
};

type GameState = {
  phase: GamePhase;
  nightStep: string | null;
  dayNumber: number;
  nightNumber: number;
  announcement: string;
  eliminatedPlayer: string | null;
  winner:
    | "village"
    | "werewolf"
    | null;
  remainingSeconds: number;
  isTimerRunning: boolean;
};

type Player = {
  id: string;
  nickname: string;
  is_alive: boolean;
  is_ready: boolean;
  is_connected: boolean;
  created_at: string;
};

const DEFAULT_SETTINGS: GameSettings = {
  roomCode: "",
  discussionSeconds: 300,
  nightSeconds: 90,
  votingSeconds: 45,
  revealRole: true,
};

async function readJsonResponse(
  response: Response,
): Promise<Record<string, any>> {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    console.error(
      "Non JSON response:",
      text,
    );

    throw new Error(
      `API error ${response.status}. Cek terminal.`,
    );
  }
}

function formatTime(
  totalSeconds: number,
) {
  const safeSeconds = Math.max(
    0,
    totalSeconds,
  );

  const minutes = Math.floor(
    safeSeconds / 60,
  );

  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

export default function HostPage() {
  const params = useParams<{
    roomCode: string;
  }>();

  const roomCode =
    params.roomCode.toUpperCase();

  const [settings, setSettings] =
    useState<GameSettings>(
      DEFAULT_SETTINGS,
    );

  const [roomId, setRoomId] =
    useState<string | null>(null);

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  const [gameState, setGameState] =
    useState<GameState>({
      phase: "lobby",
      nightStep: null,
      dayNumber: 1,
      nightNumber: 1,
      announcement: "",
      eliminatedPlayer: null,
      winner: null,
      remainingSeconds: 0,
      isTimerRunning: false,
    });

  const channel = useMemo(() => {
    if (
      typeof window === "undefined"
    ) {
      return null;
    }

    return new BroadcastChannel(
      `studio-after-dark-${roomCode}`,
    );
  }, [roomCode]);

  const alivePlayers =
    players.filter(
      (player) => player.is_alive,
    );

  const readyCount =
    players.filter(
      (player) => player.is_ready,
    ).length;

  const allPlayersReady =
    players.length >= 5 &&
    players.every(
      (player) => player.is_ready,
    );

  useEffect(() => {
    if (
      !gameState.isTimerRunning
    ) {
      return;
    }

    const timer = window.setInterval(
      () => {
        setGameState((current) => {
          if (
            current.remainingSeconds <= 1
          ) {
            return {
              ...current,
              remainingSeconds: 0,
              isTimerRunning: false,
            };
          }

          return {
            ...current,
            remainingSeconds:
              current.remainingSeconds -
              1,
          };
        });
      },
      1000,
    );

    return () =>
      window.clearInterval(timer);
  }, [gameState.isTimerRunning]);

  useEffect(() => {
    channel?.postMessage({
      roomCode,
      ...gameState,
      joinedPlayers:
        players.length,
      alivePlayers:
        alivePlayers.length,
      readyPlayers: readyCount,
    });
  }, [
    channel,
    roomCode,
    gameState,
    players.length,
    alivePlayers.length,
    readyCount,
  ]);

  useEffect(() => {
    return () => {
      channel?.close();
    };
  }, [channel]);

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
            is_ready,
            is_connected,
            created_at
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
      console.error(error);
      return;
    }

    setPlayers(
      (data ?? []) as Player[],
    );
  }

  useEffect(() => {
    let playerChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    let roomChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    async function setup() {
      const { data: room, error } =
        await supabase
          .from("rooms")
          .select(
            `
              id,
              code,
              phase,
              night_step,
              day_number,
              night_number,
              night_seconds,
              discussion_seconds,
              voting_seconds,
              reveal_role,
              announcement,
              eliminated_player_name,
              winner
            `,
          )
          .eq("code", roomCode)
          .single();

      if (error || !room) {
        console.error(error);
        return;
      }

      setRoomId(room.id);

      setSettings({
        roomId: room.id,
        roomCode: room.code,
        nightSeconds:
          room.night_seconds,
        discussionSeconds:
          room.discussion_seconds,
        votingSeconds:
          room.voting_seconds,
        revealRole:
          room.reveal_role,
      });

      setGameState((current) => ({
        ...current,
        phase: room.phase,
        nightStep:
          room.night_step,
        dayNumber:
          room.day_number,
        nightNumber:
          room.night_number,
        announcement:
          room.announcement ?? "",
        eliminatedPlayer:
          room.eliminated_player_name,
        winner:
          room.winner,
      }));

      await loadPlayers(room.id);

      playerChannel = supabase
        .channel(
          `host-players-${room.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "players",
            filter: `room_id=eq.${room.id}`,
          },
          async () => {
            await loadPlayers(
              room.id,
            );
          },
        )
        .subscribe();

      roomChannel = supabase
        .channel(
          `host-room-${room.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${room.id}`,
          },
          (payload) => {
            const updated =
              payload.new as {
                phase: GamePhase;
                night_step:
                  | string
                  | null;
                day_number: number;
                night_number: number;
                announcement: string;
                eliminated_player_name:
                  | string
                  | null;
                winner:
                  | "village"
                  | "werewolf"
                  | null;
              };

            setGameState(
              (current) => ({
                ...current,
                phase: updated.phase,
                nightStep:
                  updated.night_step,
                dayNumber:
                  updated.day_number,
                nightNumber:
                  updated.night_number,
                announcement:
                  updated.announcement ??
                  "",
                eliminatedPlayer:
                  updated.eliminated_player_name,
                winner:
                  updated.winner,
              }),
            );
          },
        )
        .subscribe();
    }

    setup();

    return () => {
      if (playerChannel) {
        supabase.removeChannel(
          playerChannel,
        );
      }

      if (roomChannel) {
        supabase.removeChannel(
          roomChannel,
        );
      }
    };
  }, [roomCode]);

  async function callEndpoint(
    endpoint: string,
    fallbackError: string,
  ) {
    setIsProcessing(true);

    try {
      const response = await fetch(
        endpoint,
        {
          method: "POST",
        },
      );

      const result =
        await readJsonResponse(
          response,
        );

      if (!response.ok) {
        alert(
          result.error ||
            fallbackError,
        );

        return null;
      }

      return result;
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : fallbackError,
      );

      return null;
    } finally {
      setIsProcessing(false);
    }
  }

  async function assignRoles() {
    if (players.length < 5) {
      alert(
        "Minimal 5 pemain.",
      );

      return;
    }

    await callEndpoint(
      `/api/rooms/${roomCode}/assign-roles`,
      "Gagal membagikan role.",
    );
  }

  async function startWerewolf() {
    if (!allPlayersReady) {
      alert(
        `${readyCount}/${players.length} pemain ready.`,
      );

      return;
    }

    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-werewolf`,
        "Gagal memulai Werewolf.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.nightSeconds,
        isTimerRunning: true,
      }));
    }
  }

  async function startSeer() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-seer`,
        "Gagal memulai Seer.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.nightSeconds,
        isTimerRunning: true,
      }));
    }
  }

  async function startDoctor() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-doctor`,
        "Gagal memulai Doctor.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.nightSeconds,
        isTimerRunning: true,
      }));
    }
  }

  async function resolveNight() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/resolve-night`,
        "Gagal resolve malam.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds: 0,
        isTimerRunning: false,
      }));
    }
  }

  async function startDiscussion() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-discussion`,
        "Gagal memulai diskusi.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.discussionSeconds,
        isTimerRunning: true,
      }));
    }
  }

  async function startVoting() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-voting`,
        "Gagal memulai voting.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.votingSeconds,
        isTimerRunning: true,
      }));
    }
  }

  async function resolveVoting() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/resolve-voting`,
        "Gagal resolve voting.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds: 0,
        isTimerRunning: false,
      }));

      alert(
        result.announcement,
      );
    }
  }

  async function nextNight() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/next-night`,
        "Gagal memulai malam berikutnya.",
      );

    if (result) {
      setGameState((current) => ({
        ...current,
        remainingSeconds:
          settings.nightSeconds,
        isTimerRunning: true,
      }));
    }
  }

  function openDisplay() {
    window.open(
      `/display/${roomCode}`,
      "_blank",
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Host Control
            </p>

            <h1 className="mt-2 text-3xl font-semibold">
              Studio After Dark
            </h1>
          </div>

          <button
            type="button"
            onClick={openDisplay}
            className="rounded-xl bg-white px-4 py-3 font-medium text-slate-950"
          >
            Open TV Display
          </button>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex justify-between gap-5">
                <div>
                  <p className="text-sm text-slate-400">
                    Room Code
                  </p>

                  <p className="mt-2 text-4xl font-semibold tracking-[0.2em]">
                    {roomCode}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-slate-400">
                    Current Phase
                  </p>

                  <p className="mt-2 text-xl font-medium capitalize">
                    {gameState.nightStep
                      ? `Night · ${gameState.nightStep}`
                      : gameState.phase.replaceAll(
                          "_",
                          " ",
                        )}
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl bg-slate-900 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">
                  Day {gameState.dayNumber}
                </p>

                <p className="mt-4 text-6xl font-semibold">
                  {formatTime(
                    gameState.remainingSeconds,
                  )}
                </p>

                <p className="mt-4 text-slate-300">
                  {gameState.announcement ||
                    "Waiting for the game to begin."}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">
                Game Flow
              </h2>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <FlowButton
                  title="1. Assign Roles"
                  description="Bagikan role pemain."
                  onClick={assignRoles}
                  disabled={isProcessing}
                />

                <FlowButton
                  title="2. Werewolf Turn"
                  description={`${readyCount}/${players.length} ready`}
                  onClick={startWerewolf}
                  disabled={
                    isProcessing ||
                    !allPlayersReady
                  }
                />

                <FlowButton
                  title="3. Seer Turn"
                  description="Seer inspect."
                  onClick={startSeer}
                  disabled={
                    isProcessing ||
                    gameState.nightStep !==
                      "werewolf"
                  }
                />

                <FlowButton
                  title="4. Doctor Turn"
                  description="Doctor protect."
                  onClick={startDoctor}
                  disabled={
                    isProcessing ||
                    gameState.nightStep !==
                      "seer"
                  }
                />

                <FlowButton
                  title="5. Resolve Morning"
                  description="Resolve hasil malam."
                  onClick={resolveNight}
                  disabled={
                    isProcessing ||
                    gameState.nightStep !==
                      "doctor"
                  }
                />

                <FlowButton
                  title="6. Start Discussion"
                  description="Mulai diskusi."
                  onClick={
                    startDiscussion
                  }
                  disabled={
                    isProcessing ||
                    gameState.phase !==
                      "morning"
                  }
                />

                <FlowButton
                  title="7. Start Voting"
                  description="Pemain memilih tersangka."
                  onClick={startVoting}
                  disabled={
                    isProcessing ||
                    gameState.phase !==
                      "discussion"
                  }
                />

                <FlowButton
                  title="8. Resolve Voting"
                  description="Hitung dan eliminasi."
                  onClick={resolveVoting}
                  disabled={
                    isProcessing ||
                    gameState.phase !==
                      "voting"
                  }
                />

                <FlowButton
                  title="9. Next Night"
                  description="Lanjut malam berikutnya."
                  onClick={nextNight}
                  disabled={
                    isProcessing ||
                    gameState.phase !==
                      "result" ||
                    Boolean(
                      gameState.winner,
                    )
                  }
                />
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Players
                </h2>

                <span className="rounded-full bg-white/10 px-3 py-1 text-sm">
                  {alivePlayers.length} alive
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {players.map(
                  (player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">
                          {index + 1}.{" "}
                          {player.nickname}
                        </p>

                        <p className="text-xs text-slate-500">
                          {player.is_alive
                            ? player.is_ready
                              ? "Alive · Ready"
                              : "Alive"
                            : "Eliminated"}
                        </p>
                      </div>

                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          player.is_alive
                            ? "bg-emerald-400"
                            : "bg-red-400"
                        }`}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>

            {gameState.winner && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">
                  Winner
                </p>

                <p className="mt-3 text-3xl font-semibold capitalize">
                  {gameState.winner}
                </p>
              </div>
            )}

            {roomId && (
              <p className="text-center text-xs text-slate-700">
                {roomId}
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function FlowButton({
  title,
  description,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-white/10 p-4 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="block font-medium">
        {title}
      </span>

      <span className="mt-1 block text-sm text-slate-400">
        {description}
      </span>
    </button>
  );
}