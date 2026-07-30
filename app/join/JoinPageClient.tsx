"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  code: string;
  status: string;
  phase: string;
};

export default function JoinPageClient() {
  const searchParams = useSearchParams();

  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const roomFromUrl = searchParams.get("room");

    if (roomFromUrl) {
      setRoomCode(roomFromUrl.toUpperCase());
    }
  }, [searchParams]);

  async function joinGame() {
    const cleanRoomCode = roomCode.trim().toUpperCase();
    const cleanNickname = nickname.trim();

    setErrorMessage("");

    if (!cleanRoomCode) {
      setErrorMessage("Room code belum diisi.");
      return;
    }

    if (!cleanNickname) {
      setErrorMessage("Nickname belum diisi.");
      return;
    }

    if (cleanNickname.length < 2) {
      setErrorMessage("Nickname minimal 2 karakter.");
      return;
    }

    if (isJoining) {
      return;
    }

    setIsJoining(true);

    try {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, code, status, phase")
        .eq("code", cleanRoomCode)
        .maybeSingle<Room>();

      if (roomError) {
        console.error(roomError);
        setErrorMessage("Gagal mencari room.");
        return;
      }

      if (!room) {
        setErrorMessage("Room tidak ditemukan.");
        return;
      }

      if (room.status !== "lobby") {
        setErrorMessage("Game sudah dimulai atau room sudah ditutup.");
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          nickname: cleanNickname,
          is_alive: true,
          is_ready: false,
          is_connected: true,
        })
        .select("id, player_token, nickname")
        .single();

      if (playerError) {
        console.error(playerError);

        if (playerError.code === "23505") {
          setErrorMessage(
            "Nickname ini sudah dipakai di dalam room.",
          );
          return;
        }

        setErrorMessage(
          `Gagal masuk room: ${playerError.message}`,
        );
        return;
      }

      localStorage.setItem(
        `player-session-${room.code}`,
        JSON.stringify({
          playerId: player.id,
          playerToken: player.player_token,
          nickname: player.nickname,
          roomId: room.id,
          roomCode: room.code,
        }),
      );

      window.location.href = `/player/${room.code}`;
    } catch (error) {
      console.error(error);
      setErrorMessage("Terjadi kesalahan saat masuk room.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center">
        <div className="w-full">
          <a
            href="/"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back
          </a>

          <div className="mt-8">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Enter the village
            </p>

            <h1 className="mt-3 text-4xl font-semibold">
              Join Game
            </h1>

            <p className="mt-3 text-slate-400">
              Masukkan room code dan nickname kamu.
            </p>
          </div>

          <div className="mt-10 space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">
                Room code
              </span>

              <input
                type="text"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder="Contoh: ABC123"
                maxLength={6}
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-lg uppercase tracking-[0.2em] outline-none transition placeholder:tracking-normal placeholder:text-slate-600 focus:border-white/30"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">
                Nickname
              </span>

              <input
                type="text"
                value={nickname}
                onChange={(event) =>
                  setNickname(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    joinGame();
                  }
                }}
                placeholder="Nama kamu"
                maxLength={20}
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-lg outline-none transition placeholder:text-slate-600 focus:border-white/30"
              />
            </label>

            {errorMessage && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={joinGame}
              disabled={isJoining}
              className="w-full rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isJoining ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}