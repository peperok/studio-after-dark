"use client";

import {
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PlayerSession = {
  playerId: string;
  playerToken: string;
  nickname: string;
  roomId: string;
  roomCode: string;
};

type RoomState = {
  id: string;
  code: string;
  phase: string;
  day_number: number;
  night_number: number;
  night_step: string | null;
  announcement: string;
  eliminated_player_name: string | null;
  winner:
    | "village"
    | "werewolf"
    | null;
};

type CurrentPlayerState = {
  id: string;
  is_alive: boolean;
};

type PlayerRole =
  | "werewolf"
  | "seer"
  | "doctor"
  | "villager";

type RoleData = {
  role: PlayerRole;
  teammates: string[];
};

type TargetPlayer = {
  id: string;
  nickname: string;
};

const ROLE_CONTENT: Record<
  PlayerRole,
  {
    name: string;
    description: string;
    objective: string;
  }
> = {
  werewolf: {
    name: "Werewolf",
    description:
      "Kamu adalah bagian dari kelompok Werewolf.",
    objective:
      "Eliminasi warga tanpa membuat identitasmu terbongkar.",
  },

  seer: {
    name: "Seer",
    description:
      "Setiap malam kamu dapat memeriksa satu pemain.",
    objective:
      "Temukan Werewolf tanpa membuka identitasmu terlalu cepat.",
  },

  doctor: {
    name: "Doctor",
    description:
      "Setiap malam kamu dapat melindungi satu pemain.",
    objective:
      "Lindungi pemain dari serangan Werewolf.",
  },

  villager: {
    name: "Villager",
    description:
      "Kamu tidak memiliki kemampuan khusus pada malam hari.",
    objective:
      "Temukan dan eliminasi seluruh Werewolf.",
  },
};

export default function PlayerPage() {
  const params = useParams<{
    roomCode: string;
  }>();

  const roomCode =
    params.roomCode.toUpperCase();

  const [session, setSession] =
    useState<PlayerSession | null>(
      null,
    );

  const [room, setRoom] =
    useState<RoomState | null>(
      null,
    );

  const [
    currentPlayer,
    setCurrentPlayer,
  ] =
    useState<CurrentPlayerState | null>(
      null,
    );

  const [roleData, setRoleData] =
    useState<RoleData | null>(
      null,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    isLoadingAction,
    setIsLoadingAction,
  ] = useState(false);

  const [
    isRoleVisible,
    setIsRoleVisible,
  ] = useState(false);

  const [
    hasConfirmedRole,
    setHasConfirmedRole,
  ] = useState(false);

  const [targets, setTargets] =
    useState<TargetPlayer[]>([]);

  const [
    selectedTarget,
    setSelectedTarget,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [
    seerResult,
    setSeerResult,
  ] = useState<{
    targetName: string;
    isWerewolf: boolean;
  } | null>(null);

  const [
    doctorResult,
    setDoctorResult,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const savedSession =
      localStorage.getItem(
        `player-session-${roomCode}`,
      );

    if (!savedSession) {
      window.location.href =
        `/join?room=${roomCode}`;

      return;
    }

    try {
      const parsedSession =
        JSON.parse(
          savedSession,
        ) as PlayerSession;

      setSession(parsedSession);

      const readyStatus =
        localStorage.getItem(
          `player-role-confirmed-${roomCode}-${parsedSession.playerId}`,
        );

      setHasConfirmedRole(
        readyStatus === "true",
      );
    } catch (error) {
      console.error(
        "Gagal membaca session pemain:",
        error,
      );

      localStorage.removeItem(
        `player-session-${roomCode}`,
      );

      window.location.href =
        `/join?room=${roomCode}`;
    }
  }, [roomCode]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const currentSession =
      session;

    let roomChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    async function setupRoom() {
      const {
        data,
        error,
      } = await supabase
        .from("rooms")
        .select(
          `
            id,
            code,
            phase,
            day_number,
            night_number,
            night_step,
            announcement,
            eliminated_player_name,
            winner
          `,
        )
        .eq(
          "id",
          currentSession.roomId,
        )
        .single();

      if (error || !data) {
        console.error(
          "Gagal mengambil room:",
          error,
        );

        setMessage(
          "Gagal mengambil kondisi game.",
        );

        setIsLoading(false);
        return;
      }

      setRoom(data as RoomState);
      setIsLoading(false);

      roomChannel = supabase
        .channel(
          `player-room-${currentSession.roomId}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter:
              `id=eq.${currentSession.roomId}`,
          },
          (payload) => {
            const updatedRoom =
              payload.new as RoomState;

            setRoom(updatedRoom);

            setTargets([]);
            setSelectedTarget("");
            setMessage("");
            setSeerResult(null);
            setDoctorResult(null);

            if (
              updatedRoom.phase ===
              "role_reveal"
            ) {
              setRoleData(null);
              setIsRoleVisible(false);
              setHasConfirmedRole(false);

              localStorage.removeItem(
                `player-role-confirmed-${roomCode}-${currentSession.playerId}`,
              );
            }
          },
        )
        .subscribe();
    }

    setupRoom();

    return () => {
      if (roomChannel) {
        supabase.removeChannel(
          roomChannel,
        );
      }
    };
  }, [roomCode, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const currentSession =
      session;

    let playerChannel:
      | ReturnType<
          typeof supabase.channel
        >
      | null = null;

    async function setupPlayerStatus() {
      const {
        data,
        error,
      } = await supabase
        .from("players")
        .select(
          `
            id,
            is_alive
          `,
        )
        .eq(
          "id",
          currentSession.playerId,
        )
        .single();

      if (error) {
        console.error(
          "Gagal mengambil status pemain:",
          error,
        );
      }

      if (data) {
        setCurrentPlayer(
          data as CurrentPlayerState,
        );
      }

      playerChannel = supabase
        .channel(
          `current-player-${currentSession.playerId}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "players",
            filter:
              `id=eq.${currentSession.playerId}`,
          },
          (payload) => {
            setCurrentPlayer(
              payload.new as CurrentPlayerState,
            );
          },
        )
        .subscribe();
    }

    setupPlayerStatus();

    return () => {
      if (playerChannel) {
        supabase.removeChannel(
          playerChannel,
        );
      }
    };
  }, [session]);

  async function fetchRole(
    showRole: boolean,
  ) {
    if (!session) {
      return null;
    }

    setIsLoadingAction(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/player-role",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              session.playerId,
            playerToken:
              session.playerToken,
          }),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Gagal mengambil role.",
        );

        return null;
      }

      const newRoleData: RoleData = {
        role: result.role,
        teammates:
          result.teammates ?? [],
      };

      setRoleData(newRoleData);

      if (showRole) {
        setIsRoleVisible(true);
      }

      return newRoleData;
    } catch (error) {
      console.error(
        "Fetch role error:",
        error,
      );

      setMessage(
        "Terjadi kesalahan saat mengambil role.",
      );

      return null;
    } finally {
      setIsLoadingAction(false);
    }
  }

  useEffect(() => {
    if (
      !session ||
      !room ||
      roleData ||
      room.phase === "lobby"
    ) {
      return;
    }

    fetchRole(false);
  }, [
    session,
    room,
    roleData,
  ]);

  async function confirmRole() {
    if (!session) {
      return;
    }

    setIsLoadingAction(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/confirm-role",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              session.playerId,
            playerToken:
              session.playerToken,
          }),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Gagal mengonfirmasi role.",
        );

        return;
      }

      setIsRoleVisible(false);
      setHasConfirmedRole(true);

      localStorage.setItem(
        `player-role-confirmed-${roomCode}-${session.playerId}`,
        "true",
      );
    } catch (error) {
      console.error(
        "Confirm role error:",
        error,
      );

      setMessage(
        "Terjadi kesalahan saat mengonfirmasi role.",
      );
    } finally {
      setIsLoadingAction(false);
    }
  }

  async function loadTargets(
    endpoint: string,
  ) {
    if (!session) {
      return;
    }

    setIsLoadingAction(true);
    setMessage("");

    try {
      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              session.playerId,
            playerToken:
              session.playerToken,
          }),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Gagal mengambil daftar pemain.",
        );

        return;
      }

      setTargets(
        result.targets ?? [],
      );

      setSelectedTarget(
        result.selectedTargetId ??
          "",
      );

      if (
        endpoint ===
        "/api/day-vote"
      ) {
        setMessage(
          `${result.submittedCount}/${result.requiredCount} votes submitted`,
        );
      }
    } catch (error) {
      console.error(
        "Load targets error:",
        error,
      );

      setMessage(
        "Terjadi kesalahan saat mengambil daftar pemain.",
      );
    } finally {
      setIsLoadingAction(false);
    }
  }

  async function submitAction(
    endpoint: string,
  ) {
    if (
      !session ||
      !selectedTarget
    ) {
      setMessage(
        "Pilih satu pemain terlebih dahulu.",
      );

      return null;
    }

    setIsLoadingAction(true);
    setMessage("");

    try {
      const response = await fetch(
        endpoint,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              session.playerId,
            playerToken:
              session.playerToken,
            targetPlayerId:
              selectedTarget,
          }),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Gagal menyimpan pilihan.",
        );

        return null;
      }

      return result;
    } catch (error) {
      console.error(
        "Submit action error:",
        error,
      );

      setMessage(
        "Terjadi kesalahan saat menyimpan pilihan.",
      );

      return null;
    } finally {
      setIsLoadingAction(false);
    }
  }

  if (
    isLoading ||
    !session ||
    !room
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <p className="text-slate-400">
          Loading game...
        </p>
      </main>
    );
  }

  const currentRoom = room;

  if (
    currentRoom.phase ===
    "role_reveal"
  ) {
    const roleContent = roleData
      ? ROLE_CONTENT[
          roleData.role
        ]
      : null;

    return (
      <PageCard>
        <Label>
          Keep It Secret
        </Label>

        {!isRoleVisible &&
          !hasConfirmedRole && (
            <>
              <Title>
                Your Role Is Ready
              </Title>

              <p className="mt-4 text-lg leading-8 text-slate-300">
                Pastikan tidak ada pemain
                lain yang melihat layar
                kamu.
              </p>

              <ActionButton
                onClick={() =>
                  fetchRole(true)
                }
                disabled={
                  isLoadingAction
                }
              >
                {isLoadingAction
                  ? "Loading Role..."
                  : "Reveal My Role"}
              </ActionButton>
            </>
          )}

        {isRoleVisible &&
          roleData &&
          roleContent && (
            <>
              <Label>You Are</Label>

              <Title>
                {roleContent.name}
              </Title>

              <p className="mt-5 text-lg leading-8 text-slate-300">
                {
                  roleContent.description
                }
              </p>

              <div className="mt-6 rounded-2xl bg-slate-900 p-5 text-left">
                <p className="text-sm text-slate-400">
                  Your Objective
                </p>

                <p className="mt-2 leading-7 text-slate-200">
                  {
                    roleContent.objective
                  }
                </p>
              </div>

              {roleData.role ===
                "werewolf" && (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-left">
                  <p className="text-sm text-red-200">
                    Werewolf Teammates
                  </p>

                  <p className="mt-2 text-red-100">
                    {roleData.teammates
                      .length > 0
                      ? roleData.teammates.join(
                          ", ",
                        )
                      : "Kamu satu-satunya Werewolf."}
                  </p>
                </div>
              )}

              <ActionButton
                onClick={confirmRole}
                disabled={
                  isLoadingAction
                }
              >
                I Understand — Hide Role
              </ActionButton>
            </>
          )}

        {hasConfirmedRole &&
          !isRoleVisible && (
            <>
              <Title>
                Role Confirmed
              </Title>

              <p className="mt-4 text-lg leading-8 text-slate-300">
                Role kamu sudah
                disembunyikan. Tunggu
                host memulai game.
              </p>
            </>
          )}

        {message && (
          <Message>{message}</Message>
        )}
      </PageCard>
    );
  }

  if (
    currentPlayer &&
    !currentPlayer.is_alive &&
    currentRoom.phase !==
      "game_over"
  ) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center">
          <div className="w-full rounded-3xl border border-red-500/20 bg-red-500/5 p-7 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-red-300">
              Eliminated
            </p>

            <h1 className="mt-5 text-5xl font-semibold">
              Kamu Metong
            </h1>

            <p className="mt-5 text-lg leading-8 text-slate-300">
              Kamu sudah tereliminasi
              dan tidak dapat mengikuti
              action malam, diskusi,
              atau voting berikutnya.
            </p>

            <div className="mt-7 rounded-2xl border border-white/10 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Penting
              </p>

              <p className="mt-2 leading-7 text-slate-200">
                Tetap rahasiakan role
                kamu sampai game benar-benar
                selesai.
              </p>
            </div>

            <p className="mt-7 text-sm text-slate-500">
              {session.nickname} · Room{" "}
              {roomCode}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (
    currentRoom.phase === "night"
  ) {
    const currentStep =
      currentRoom.night_step;

    const requiredRole =
      currentStep === "werewolf"
        ? "werewolf"
        : currentStep === "seer"
          ? "seer"
          : currentStep ===
              "doctor"
            ? "doctor"
            : null;

    if (
      requiredRole &&
      roleData?.role !==
        requiredRole
    ) {
      return (
        <WaitingCard
          label={`Night ${currentRoom.night_number}`}
          title="Keep Your Eyes Closed"
          description={
            currentStep ===
            "werewolf"
              ? "Werewolves are choosing their target."
              : currentStep ===
                  "seer"
                ? "The Seer is inspecting a player."
                : "The Doctor is protecting a player."
          }
        />
      );
    }

    if (
      currentStep === "werewolf"
    ) {
      return (
        <TargetAction
          label="Werewolf Turn"
          title="Choose Your Target"
          description="Target dengan suara terbanyak akan diserang."
          targets={targets}
          selectedTarget={
            selectedTarget
          }
          setSelectedTarget={
            setSelectedTarget
          }
          loading={
            isLoadingAction
          }
          message={message}
          onLoad={() =>
            loadTargets(
              "/api/night/werewolf",
            )
          }
          onSubmit={async () => {
            const result =
              await submitAction(
                "/api/night/werewolf",
              );

            if (result) {
              setMessage(
                `Vote saved · ${result.submittedCount}/${result.requiredCount} Werewolf submitted`,
              );
            }
          }}
          loadLabel="Show Players"
          submitLabel="Confirm Target"
        />
      );
    }

    if (
      currentStep === "seer"
    ) {
      if (seerResult) {
        return (
          <PageCard>
            <Label>
              Inspection Result
            </Label>

            <Title>
              {seerResult.targetName}
            </Title>

            <p
              className={`mt-6 text-2xl font-semibold ${
                seerResult.isWerewolf
                  ? "text-red-300"
                  : "text-emerald-300"
              }`}
            >
              {seerResult.isWerewolf
                ? "IS A WEREWOLF"
                : "IS NOT A WEREWOLF"}
            </p>

            <p className="mt-5 text-sm text-slate-500">
              Ingat hasilnya dan jangan
              tunjukkan layar kamu.
            </p>
          </PageCard>
        );
      }

      return (
        <TargetAction
          label="Seer Turn"
          title="Inspect One Player"
          description="Pilih satu pemain untuk mengetahui apakah dia Werewolf."
          targets={targets}
          selectedTarget={
            selectedTarget
          }
          setSelectedTarget={
            setSelectedTarget
          }
          loading={
            isLoadingAction
          }
          message={message}
          onLoad={() =>
            loadTargets(
              "/api/night/seer",
            )
          }
          onSubmit={async () => {
            const result =
              await submitAction(
                "/api/night/seer",
              );

            if (result) {
              setSeerResult({
                targetName:
                  result.targetName,
                isWerewolf:
                  result.isWerewolf,
              });
            }
          }}
          loadLabel="Show Players"
          submitLabel="Inspect Player"
        />
      );
    }

    if (
      currentStep === "doctor"
    ) {
      if (doctorResult) {
        return (
          <PageCard>
            <Label>
              Protection Confirmed
            </Label>

            <Title>
              {doctorResult}
            </Title>

            <p className="mt-5 text-lg leading-8 text-slate-300">
              Pemain ini dilindungi
              untuk malam ini.
            </p>

            <p className="mt-6 text-sm text-slate-500">
              Tunggu instruksi
              berikutnya dari host.
            </p>
          </PageCard>
        );
      }

      return (
        <TargetAction
          label="Doctor Turn"
          title="Protect One Player"
          description="Pilih satu pemain yang ingin kamu lindungi malam ini."
          targets={targets}
          selectedTarget={
            selectedTarget
          }
          setSelectedTarget={
            setSelectedTarget
          }
          loading={
            isLoadingAction
          }
          message={message}
          onLoad={() =>
            loadTargets(
              "/api/night/doctor",
            )
          }
          onSubmit={async () => {
            const result =
              await submitAction(
                "/api/night/doctor",
              );

            if (result) {
              setDoctorResult(
                result.targetName,
              );
            }
          }}
          loadLabel="Show Players"
          submitLabel="Protect Player"
        />
      );
    }

    return (
      <WaitingCard
        label={`Night ${currentRoom.night_number}`}
        title="The Village Sleeps"
        description="Tunggu instruksi berikutnya dari host."
      />
    );
  }

  if (
    currentRoom.phase ===
    "voting"
  ) {
    return (
      <TargetAction
        label={`Day ${currentRoom.day_number}`}
        title="Vote for a Player"
        description="Pilih pemain yang paling kamu curigai sebagai Werewolf."
        targets={targets}
        selectedTarget={
          selectedTarget
        }
        setSelectedTarget={
          setSelectedTarget
        }
        loading={
          isLoadingAction
        }
        message={message}
        onLoad={() =>
          loadTargets(
            "/api/day-vote",
          )
        }
        onSubmit={async () => {
          const result =
            await submitAction(
              "/api/day-vote",
            );

          if (result) {
            setMessage(
              `Vote saved · ${result.submittedCount}/${result.requiredCount} submitted`,
            );
          }
        }}
        loadLabel="Show Players"
        submitLabel="Confirm Vote"
      />
    );
  }

  if (
    currentRoom.phase ===
    "game_over"
  ) {
    return (
      <PageCard>
        <Label>Game Over</Label>

        <Title>
          {currentRoom.winner ===
          "village"
            ? "The Village Wins"
            : "The Werewolves Win"}
        </Title>

        <p className="mt-5 text-lg leading-8 text-slate-300">
          {currentRoom.announcement ||
            "The game has ended."}
        </p>

        {roleData && (
          <div className="mt-7 rounded-2xl bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              Your Role
            </p>

            <p className="mt-2 text-2xl font-semibold">
              {
                ROLE_CONTENT[
                  roleData.role
                ].name
              }
            </p>
          </div>
        )}

        <p className="mt-7 text-sm text-slate-500">
          {session.nickname} · Room{" "}
          {roomCode}
        </p>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <Label>
        Day {currentRoom.day_number}
      </Label>

      <Title>
        {currentRoom.phase ===
        "lobby"
          ? `Welcome, ${session.nickname}`
          : currentRoom.phase ===
              "morning"
            ? currentRoom.eliminated_player_name
              ? `${currentRoom.eliminated_player_name} Was Eliminated`
              : "Nobody Died"
            : currentRoom.phase ===
                "discussion"
              ? "Discussion Time"
              : currentRoom.phase ===
                  "result"
                ? currentRoom.eliminated_player_name
                  ? `${currentRoom.eliminated_player_name} Was Eliminated`
                  : "Voting Ended in a Tie"
                : "Please Wait"}
      </Title>

      <p className="mt-5 text-lg leading-8 text-slate-300">
        {currentRoom.announcement ||
          (currentRoom.phase ===
          "lobby"
            ? "Kamu sudah masuk. Tunggu host memulai game."
            : "Menunggu instruksi dari host.")}
      </p>

      <p className="mt-8 text-sm text-slate-500">
        {session.nickname} · Room{" "}
        {roomCode}
      </p>
    </PageCard>
  );
}

function PageCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-7 text-center">
          {children}
        </div>
      </div>
    </main>
  );
}

function WaitingCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <PageCard>
      <Label>{label}</Label>

      <Title>{title}</Title>

      <p className="mt-5 text-lg leading-8 text-slate-300">
        {description}
      </p>

      <p className="mt-7 text-sm text-slate-500">
        Jangan melihat layar pemain
        lain.
      </p>
    </PageCard>
  );
}

function TargetAction({
  label,
  title,
  description,
  targets,
  selectedTarget,
  setSelectedTarget,
  loading,
  message,
  onLoad,
  onSubmit,
  loadLabel,
  submitLabel,
}: {
  label: string;
  title: string;
  description: string;
  targets: TargetPlayer[];
  selectedTarget: string;
  setSelectedTarget: (
    id: string,
  ) => void;
  loading: boolean;
  message: string;
  onLoad: () => void;
  onSubmit: () => void;
  loadLabel: string;
  submitLabel: string;
}) {
  return (
    <PageCard>
      <Label>{label}</Label>

      <Title>{title}</Title>

      <p className="mt-5 text-lg leading-8 text-slate-300">
        {description}
      </p>

      {targets.length === 0 ? (
        <ActionButton
          onClick={onLoad}
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : loadLabel}
        </ActionButton>
      ) : (
        <>
          <div className="mt-8 space-y-3 text-left">
            {targets.map(
              (target) => (
                <label
                  key={target.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                    selectedTarget ===
                    target.id
                      ? "border-white bg-white/10"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="target-player"
                    checked={
                      selectedTarget ===
                      target.id
                    }
                    onChange={() =>
                      setSelectedTarget(
                        target.id,
                      )
                    }
                  />

                  <span className="font-medium">
                    {target.nickname}
                  </span>
                </label>
              ),
            )}
          </div>

          <ActionButton
            onClick={onSubmit}
            disabled={
              loading ||
              !selectedTarget
            }
          >
            {loading
              ? "Submitting..."
              : submitLabel}
          </ActionButton>
        </>
      )}

      {message && (
        <Message>{message}</Message>
      )}
    </PageCard>
  );
}

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
      {children}
    </p>
  );
}

function Title({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h1 className="mt-5 text-4xl font-semibold">
      {children}
    </h1>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-7 w-full rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Message({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-200">
      {children}
    </div>
  );
}