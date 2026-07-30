"use client";

import {
  useEffect,
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

type GameRole =
  | "werewolf"
  | "seer"
  | "doctor"
  | "villager";

type Winner =
  | "village"
  | "werewolf"
  | null;

type RoomState = {
  id: string;
  phase: GamePhase;
  night_step: string | null;
  day_number: number;
  night_number: number;
  night_seconds: number;
  discussion_seconds: number;
  voting_seconds: number;
  announcement: string;
  eliminated_player_name:
    | string
    | null;
  winner: Winner;
};

type HostPlayer = {
  id: string;
  nickname: string;
  is_alive: boolean;
  is_ready: boolean;
  is_connected: boolean;
  created_at: string;
  role: GameRole | null;
};

async function readJson(
  response: Response,
) {
  const text =
    await response.text();

  try {
    return JSON.parse(text);
  } catch {
    console.error(
      "Non JSON response:",
      text,
    );

    throw new Error(
      `API error ${response.status}.`,
    );
  }
}

function formatTime(
  totalSeconds: number,
) {
  const seconds = Math.max(
    0,
    totalSeconds,
  );

  return `${String(
    Math.floor(seconds / 60),
  ).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function roleLabel(
  role: GameRole | null,
) {
  if (!role) {
    return "Not Assigned";
  }

  if (
    role === "werewolf"
  ) {
    return "Werewolf";
  }

  if (role === "seer") {
    return "Seer";
  }

  if (role === "doctor") {
    return "Doctor";
  }

  return "Villager";
}

export default function HostPage() {
  const params = useParams<{
    roomCode: string;
  }>();

  const roomCode =
    params.roomCode.toUpperCase();

  const [room, setRoom] =
    useState<RoomState | null>(
      null,
    );

  const [
    players,
    setPlayers,
  ] = useState<HostPlayer[]>(
    [],
  );

  const [
    remainingSeconds,
    setRemainingSeconds,
  ] = useState(0);

  const [
    isTimerRunning,
    setIsTimerRunning,
  ] = useState(false);

  const [
    isProcessing,
    setIsProcessing,
  ] = useState(false);

  const alivePlayers =
    players.filter(
      (player) =>
        player.is_alive,
    );

  const readyCount =
    players.filter(
      (player) =>
        player.is_ready,
    ).length;

  const allPlayersReady =
    players.length >= 5 &&
    players.every(
      (player) =>
        player.is_ready,
    );

  const aliveSeer =
    players.some(
      (player) =>
        player.is_alive &&
        player.role === "seer",
    );

  const aliveDoctor =
    players.some(
      (player) =>
        player.is_alive &&
        player.role ===
          "doctor",
    );

  useEffect(() => {
    if (!isTimerRunning) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setRemainingSeconds(
          (current) => {
            if (current <= 1) {
              setIsTimerRunning(
                false,
              );

              return 0;
            }

            return (
              current - 1
            );
          },
        );
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [isTimerRunning]);

  async function loadRoster() {
    const response = await fetch(
      `/api/rooms/${roomCode}/host-roster`,
      {
        cache: "no-store",
      },
    );

    const result =
      await readJson(response);

    if (!response.ok) {
      console.error(
        result.error,
      );

      return;
    }

    setPlayers(
      result.roster ?? [],
    );
  }

  useEffect(() => {
    let roomChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    let playersChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    async function setup() {
      const {
        data,
        error,
      } = await supabase
        .from("rooms")
        .select(
          `
            id,
            phase,
            night_step,
            day_number,
            night_number,
            night_seconds,
            discussion_seconds,
            voting_seconds,
            announcement,
            eliminated_player_name,
            winner
          `,
        )
        .eq("code", roomCode)
        .single();

      if (
        error ||
        !data
      ) {
        console.error(error);
        return;
      }

      setRoom(
        data as RoomState,
      );

      await loadRoster();

      roomChannel = supabase
        .channel(
          `host-room-${data.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter:
              `id=eq.${data.id}`,
          },
          (payload) => {
            setRoom(
              payload.new as RoomState,
            );
          },
        )
        .subscribe();

      playersChannel =
        supabase
          .channel(
            `host-players-${data.id}`,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "players",
              filter:
                `room_id=eq.${data.id}`,
            },
            async () => {
              await loadRoster();
            },
          )
          .subscribe();
    }

    setup();

    return () => {
      if (roomChannel) {
        supabase.removeChannel(
          roomChannel,
        );
      }

      if (playersChannel) {
        supabase.removeChannel(
          playersChannel,
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
        await readJson(response);

      if (!response.ok) {
        alert(
          result.error ||
            fallbackError,
        );

        return null;
      }

      await loadRoster();

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
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/assign-roles`,
        "Gagal membagikan role.",
      );

    if (result) {
      await loadRoster();

      alert(
        `Role berhasil dibagikan.\n\n` +
          `Werewolf: ${result.composition.werewolfCount}\n` +
          `Seer: ${result.composition.seerCount}\n` +
          `Doctor: ${result.composition.doctorCount}\n` +
          `Villager: ${result.composition.villagerCount}`,
      );
    }
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

    if (
      result &&
      room
    ) {
      setRemainingSeconds(
        room.night_seconds,
      );

      setIsTimerRunning(true);
    }
  }

  async function continueNight() {
    if (!room) {
      return;
    }

    if (
      room.night_step ===
      "werewolf"
    ) {
      if (aliveSeer) {
        const result =
          await callEndpoint(
            `/api/rooms/${roomCode}/start-seer`,
            "Gagal memulai Seer.",
          );

        if (result) {
          setRemainingSeconds(
            room.night_seconds,
          );

          setIsTimerRunning(
            true,
          );
        }

        return;
      }

      if (aliveDoctor) {
        const result =
          await callEndpoint(
            `/api/rooms/${roomCode}/start-doctor`,
            "Gagal memulai Doctor.",
          );

        if (result) {
          setRemainingSeconds(
            room.night_seconds,
          );

          setIsTimerRunning(
            true,
          );
        }

        return;
      }

      await resolveNight();
      return;
    }

    if (
      room.night_step === "seer"
    ) {
      if (aliveDoctor) {
        const result =
          await callEndpoint(
            `/api/rooms/${roomCode}/start-doctor`,
            "Gagal memulai Doctor.",
          );

        if (result) {
          setRemainingSeconds(
            room.night_seconds,
          );

          setIsTimerRunning(
            true,
          );
        }

        return;
      }

      await resolveNight();
      return;
    }

    if (
      room.night_step ===
      "doctor"
    ) {
      await resolveNight();
    }
  }

  async function resolveNight() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/resolve-night`,
        "Gagal resolve malam.",
      );

    if (result) {
      setRemainingSeconds(0);
      setIsTimerRunning(false);

      if (result.winner) {
        alert(
          result.winner ===
            "werewolf"
            ? "Werewolves Win!"
            : "Village Wins!",
        );
      }
    }
  }

  async function startDiscussion() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-discussion`,
        "Gagal memulai diskusi.",
      );

    if (
      result &&
      room
    ) {
      setRemainingSeconds(
        room.discussion_seconds,
      );

      setIsTimerRunning(true);
    }
  }

  async function startVoting() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/start-voting`,
        "Gagal memulai voting.",
      );

    if (
      result &&
      room
    ) {
      setRemainingSeconds(
        room.voting_seconds,
      );

      setIsTimerRunning(true);
    }
  }

  async function resolveVoting() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/resolve-voting`,
        "Gagal resolve voting.",
      );

    if (result) {
      setRemainingSeconds(0);
      setIsTimerRunning(false);

      if (result.winner) {
        alert(
          result.winner ===
            "werewolf"
            ? "Werewolves Win!"
            : "Village Wins!",
        );
      }
    }
  }

  async function nextNight() {
    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/next-night`,
        "Gagal memulai malam berikutnya.",
      );

    if (
      result &&
      room
    ) {
      setRemainingSeconds(
        room.night_seconds,
      );

      setIsTimerRunning(true);
    }
  }

  async function setWinner(
    winner:
      | "village"
      | "werewolf",
  ) {
    const label =
      winner === "village"
        ? "Village"
        : "Werewolves";

    if (
      !window.confirm(
        `${label} menang?`,
      )
    ) {
      return;
    }

    const { error } =
      await supabase
        .from("rooms")
        .update({
          status: "finished",
          phase: "game_over",
          night_step: null,
          winner,
          announcement:
            winner ===
            "village"
              ? "The Village wins!"
              : "The Werewolves win!",
        })
        .eq("code", roomCode);

    if (error) {
      alert(
        "Gagal menetapkan pemenang.",
      );
    }
  }

  async function resetGame() {
    if (
      !window.confirm(
        "Reset game dan kembali ke lobby?",
      )
    ) {
      return;
    }

    const result =
      await callEndpoint(
        `/api/rooms/${roomCode}/reset-game`,
        "Gagal reset game.",
      );

    if (result) {
      setRemainingSeconds(0);
      setIsTimerRunning(false);

      alert(
        "Game berhasil direset.",
      );
    }
  }

  async function copyJoinLink() {
    const url =
      `${window.location.origin}/join?room=${roomCode}`;

    try {
      await navigator.clipboard.writeText(
        url,
      );

      alert(
        "Join link berhasil disalin.",
      );
    } catch {
      window.prompt(
        "Copy link ini:",
        url,
      );
    }
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading host...
      </main>
    );
  }

  const continueDescription =
    room.night_step ===
    "werewolf"
      ? aliveSeer
        ? "Lanjut ke Seer."
        : aliveDoctor
          ? "Seer mati, langsung ke Doctor."
          : "Seer dan Doctor mati, langsung resolve."
      : room.night_step ===
          "seer"
        ? aliveDoctor
          ? "Lanjut ke Doctor."
          : "Doctor mati, langsung resolve."
        : "Resolve hasil malam.";

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Host Control
            </p>

            <h1 className="mt-2 text-3xl font-semibold">
              Studio After Dark
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={copyJoinLink}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm"
            >
              Copy Join Link
            </button>

            <button
              type="button"
              onClick={() =>
                window.open(
                  `/display/${roomCode}`,
                  "_blank",
                )
              }
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-950"
            >
              Open TV Display
            </button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex justify-between gap-6">
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
                    {room.night_step
                      ? `Night · ${room.night_step}`
                      : room.phase.replaceAll(
                          "_",
                          " ",
                        )}
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl bg-slate-900 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">
                  Day {room.day_number}
                </p>

                <p className="mt-4 text-6xl font-semibold">
                  {formatTime(
                    remainingSeconds,
                  )}
                </p>

                <p className="mt-4 text-slate-300">
                  {room.announcement ||
                    "Waiting for the game to begin."}
                </p>

                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setIsTimerRunning(
                        (current) =>
                          !current,
                      )
                    }
                    disabled={
                      remainingSeconds ===
                      0
                    }
                    className="rounded-xl border border-white/10 px-4 py-2 disabled:opacity-40"
                  >
                    {isTimerRunning
                      ? "Pause Timer"
                      : "Resume Timer"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setRemainingSeconds(
                        (current) =>
                          current + 30,
                      )
                    }
                    className="rounded-xl border border-white/10 px-4 py-2"
                  >
                    +30 Seconds
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">
                Game Flow
              </h2>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <FlowButton
                  title="1. Assign Roles"
                  description="Bagikan role otomatis."
                  onClick={assignRoles}
                  disabled={
                    isProcessing
                  }
                />

                <FlowButton
                  title="2. Start Werewolf"
                  description={`${readyCount}/${players.length} ready`}
                  onClick={
                    startWerewolf
                  }
                  disabled={
                    isProcessing ||
                    !allPlayersReady ||
                    Boolean(
                      room.winner,
                    )
                  }
                />

                <FlowButton
                  title="3. Continue Night"
                  description={
                    continueDescription
                  }
                  onClick={
                    continueNight
                  }
                  disabled={
                    isProcessing ||
                    room.phase !==
                      "night" ||
                    !room.night_step ||
                    Boolean(
                      room.winner,
                    )
                  }
                />

                <FlowButton
                  title="4. Start Discussion"
                  description="Mulai diskusi siang."
                  onClick={
                    startDiscussion
                  }
                  disabled={
                    isProcessing ||
                    room.phase !==
                      "morning" ||
                    Boolean(
                      room.winner,
                    )
                  }
                />

                <FlowButton
                  title="5. Start Voting"
                  description="Pemain hidup melakukan voting."
                  onClick={
                    startVoting
                  }
                  disabled={
                    isProcessing ||
                    room.phase !==
                      "discussion" ||
                    Boolean(
                      room.winner,
                    )
                  }
                />

                <FlowButton
                  title="6. Resolve Voting"
                  description="Eliminasi dan cek pemenang."
                  onClick={
                    resolveVoting
                  }
                  disabled={
                    isProcessing ||
                    room.phase !==
                      "voting" ||
                    Boolean(
                      room.winner,
                    )
                  }
                />

                <FlowButton
                  title="7. Next Night"
                  description="Mulai malam berikutnya."
                  onClick={
                    nextNight
                  }
                  disabled={
                    isProcessing ||
                    room.phase !==
                      "result" ||
                    Boolean(
                      room.winner,
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
                  Players & Roles
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
                      className="rounded-2xl bg-slate-900 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">
                            {index + 1}.{" "}
                            {player.nickname}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {player.is_alive
                              ? player.is_ready
                                ? "Alive · Ready"
                                : "Alive · Not Ready"
                              : "Metong"}
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

                      <div className="mt-3 rounded-xl border border-white/10 px-3 py-2">
                        <p className="text-xs text-slate-500">
                          Role
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          {roleLabel(
                            player.role,
                          )}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {room.winner && (
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                  Game Over
                </p>

                <p className="mt-4 text-3xl font-semibold">
                  {room.winner ===
                  "village"
                    ? "Village Wins"
                    : "Werewolves Win"}
                </p>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">
                Manual Controls
              </h2>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() =>
                    setWinner(
                      "village",
                    )
                  }
                  className="w-full rounded-xl border border-white/10 px-4 py-3"
                >
                  Village Wins
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWinner(
                      "werewolf",
                    )
                  }
                  className="w-full rounded-xl border border-white/10 px-4 py-3"
                >
                  Werewolves Win
                </button>

                <button
                  type="button"
                  onClick={resetGame}
                  className="w-full rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-200"
                >
                  Reset Game
                </button>
              </div>
            </div>
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