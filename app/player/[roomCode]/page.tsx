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
  eliminated_player_name:
    | string
    | null;
  winner:
    | "village"
    | "werewolf"
    | null;
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
      "Temukan Werewolf tanpa membuka identitasmu.",
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
      "Kamu tidak memiliki kemampuan malam.",
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
    useState<RoomState | null>(null);

  const [roleData, setRoleData] =
    useState<RoleData | null>(null);

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

      const ready =
        localStorage.getItem(
          `player-role-confirmed-${roomCode}-${parsedSession.playerId}`,
        );

      setHasConfirmedRole(
        ready === "true",
      );
    } catch {
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

    async function setup() {
      const { data, error } =
        await supabase
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
            filter: `id=eq.${currentSession.roomId}`,
          },
          (payload) => {
            const updated =
              payload.new as RoomState;

            setRoom(updated);
            setTargets([]);
            setSelectedTarget("");
            setMessage("");
            setSeerResult(null);
            setDoctorResult(null);

            if (
              updated.phase ===
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

    setup();

    return () => {
      if (roomChannel) {
        supabase.removeChannel(
          roomChannel,
        );
      }
    };
  }, [roomCode, session]);

  async function fetchRole(
    showRole: boolean,
  ) {
    if (!session) {
      return;
    }

    setIsLoadingAction(true);

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
        setMessage(result.error);
        return;
      }

      setRoleData({
        role: result.role,
        teammates:
          result.teammates ?? [],
      });

      if (showRole) {
        setIsRoleVisible(true);
      }
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
  }, [session, room, roleData]);

  async function confirmRole() {
    if (!session) {
      return;
    }

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
      setMessage(result.error);
      return;
    }

    setIsRoleVisible(false);
    setHasConfirmedRole(true);

    localStorage.setItem(
      `player-role-confirmed-${roomCode}-${session.playerId}`,
      "true",
    );
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
        setMessage(result.error);
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
        setMessage(result.error);
        return null;
      }

      return result;
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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading game...
      </main>
    );
  }

  const currentRoom = room;

  if (
    currentRoom.phase ===
    "role_reveal"
  ) {
    const roleContent = roleData
      ? ROLE_CONTENT[roleData.role]
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

              <ActionButton
                onClick={() =>
                  fetchRole(true)
                }
                disabled={
                  isLoadingAction
                }
              >
                Reveal My Role
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

              <p className="mt-5 text-slate-300">
                {roleContent.description}
              </p>

              <div className="mt-6 rounded-2xl bg-slate-900 p-5 text-left">
                {roleContent.objective}
              </div>

              {roleData.role ===
                "werewolf" && (
                <div className="mt-4 rounded-2xl bg-red-500/10 p-5 text-left">
                  Teammates:{" "}
                  {roleData.teammates
                    .length > 0
                    ? roleData.teammates.join(
                        ", ",
                      )
                    : "None"}
                </div>
              )}

              <ActionButton
                onClick={confirmRole}
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

              <p className="mt-4 text-slate-300">
                Tunggu host memulai game.
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
    currentRoom.phase === "night"
  ) {
    const step =
      currentRoom.night_step;

    const requiredRole =
      step === "werewolf"
        ? "werewolf"
        : step === "seer"
          ? "seer"
          : step === "doctor"
            ? "doctor"
            : null;

    if (
      requiredRole &&
      roleData?.role !==
        requiredRole
    ) {
      return (
        <WaitingCard
          title="Keep Your Eyes Closed"
          description={
            step === "werewolf"
              ? "Werewolves are choosing their target."
              : step === "seer"
                ? "The Seer is inspecting a player."
                : "The Doctor is protecting a player."
          }
        />
      );
    }

    if (
      step === "werewolf"
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
                `${result.submittedCount}/${result.requiredCount} Werewolf submitted`,
              );
            }
          }}
        />
      );
    }

    if (step === "seer") {
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
              className={`mt-5 text-2xl font-semibold ${
                seerResult.isWerewolf
                  ? "text-red-300"
                  : "text-emerald-300"
              }`}
            >
              {seerResult.isWerewolf
                ? "IS A WEREWOLF"
                : "IS NOT A WEREWOLF"}
            </p>
          </PageCard>
        );
      }

      return (
        <TargetAction
          label="Seer Turn"
          title="Inspect One Player"
          description="Pilih satu pemain untuk diperiksa."
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
        />
      );
    }

    if (step === "doctor") {
      if (doctorResult) {
        return (
          <PageCard>
            <Label>
              Protection Confirmed
            </Label>

            <Title>
              {doctorResult}
            </Title>

            <p className="mt-4 text-slate-300">
              Pemain ini dilindungi malam ini.
            </p>
          </PageCard>
        );
      }

      return (
        <TargetAction
          label="Doctor Turn"
          title="Protect One Player"
          description="Pilih satu pemain untuk dilindungi."
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
        />
      );
    }
  }

  if (
    currentRoom.phase ===
    "voting"
  ) {
    return (
      <TargetAction
        label={`Day ${currentRoom.day_number}`}
        title="Vote for a Player"
        description="Pilih pemain yang paling kamu curigai."
        targets={targets}
        selectedTarget={
          selectedTarget
        }
        setSelectedTarget={
          setSelectedTarget
        }
        loading={isLoadingAction}
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

        <p className="mt-4 text-lg text-slate-300">
          {currentRoom.announcement}
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

      <p className="mt-4 text-lg leading-8 text-slate-300">
        {currentRoom.announcement ||
          "Menunggu instruksi dari host."}
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
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <PageCard>
      <Label>Night</Label>

      <Title>{title}</Title>

      <p className="mt-4 text-slate-300">
        {description}
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
}) {
  return (
    <PageCard>
      <Label>{label}</Label>

      <Title>{title}</Title>

      <p className="mt-4 text-slate-300">
        {description}
      </p>

      {targets.length === 0 ? (
        <ActionButton
          onClick={onLoad}
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : "Show Players"}
        </ActionButton>
      ) : (
        <>
          <div className="mt-8 space-y-3 text-left">
            {targets.map(
              (target) => (
                <label
                  key={target.id}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 p-4"
                >
                  <input
                    type="radio"
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

                  <span>
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
            Confirm Choice
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
      className="mt-7 w-full rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="mt-5 rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200">
      {children}
    </div>
  );
}