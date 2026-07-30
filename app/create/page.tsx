"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let index = 0; index < 6; index += 1) {
    result += characters.charAt(
      Math.floor(Math.random() * characters.length),
    );
  }

  return result;
}

export default function CreateGamePage() {
  const [discussionMinutes, setDiscussionMinutes] = useState(5);
  const [nightSeconds, setNightSeconds] = useState(90);
  const [votingSeconds, setVotingSeconds] = useState(45);
  const [revealRole, setRevealRole] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  async function createGame() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const roomCode = generateRoomCode();

      const { data: room, error } = await supabase
        .from("rooms")
        .insert({
          code: roomCode,
          status: "lobby",
          phase: "lobby",
          day_number: 1,
          discussion_seconds: discussionMinutes * 60,
          night_seconds: nightSeconds,
          voting_seconds: votingSeconds,
          reveal_role: revealRole,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert(`Gagal membuat room: ${error.message}`);
        return;
      }

      const settings = {
        roomId: room.id,
        roomCode: room.code,
        discussionSeconds: room.discussion_seconds,
        nightSeconds: room.night_seconds,
        votingSeconds: room.voting_seconds,
        revealRole: room.reveal_role,
      };

      localStorage.setItem(
        `host-settings-${room.code}`,
        JSON.stringify(settings),
      );

      window.location.href = `/host/${room.code}`;
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat membuat room.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          ← Back
        </a>

        <div className="mt-8">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Host setup
          </p>

          <h1 className="mt-3 text-4xl font-semibold">
            Create a new game
          </h1>

          <p className="mt-3 text-slate-400">
            Atur durasi permainan sebelum room dibuat.
          </p>
        </div>

        <div className="mt-10 space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">
              Discussion duration
            </span>

            <select
              value={discussionMinutes}
              onChange={(event) =>
                setDiscussionMinutes(Number(event.target.value))
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 outline-none"
            >
              <option value={3}>3 minutes</option>
              <option value={5}>5 minutes</option>
              <option value={7}>7 minutes</option>
              <option value={10}>10 minutes</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">
              Night duration
            </span>

            <select
              value={nightSeconds}
              onChange={(event) =>
                setNightSeconds(Number(event.target.value))
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 outline-none"
            >
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">
              Voting duration
            </span>

            <select
              value={votingSeconds}
              onChange={(event) =>
                setVotingSeconds(Number(event.target.value))
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 outline-none"
            >
              <option value={30}>30 seconds</option>
              <option value={45}>45 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 p-4">
            <input
              type="checkbox"
              checked={revealRole}
              onChange={(event) =>
                setRevealRole(event.target.checked)
              }
              className="mt-1"
            />

            <span>
              <span className="block font-medium">
                Reveal eliminated player’s role
              </span>

              <span className="mt-1 block text-sm text-slate-400">
                Matikan kalau mau game lebih sulit.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={createGame}
            disabled={isCreating}
            className="w-full rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating Room..." : "Create Room"}
          </button>
        </div>
      </div>
    </main>
  );
}