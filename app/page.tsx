"use client";

import { useState } from "react";

export default function HomePage() {
  const [roomCode, setRoomCode] = useState("");

  function handleJoin() {
    const cleanCode = roomCode.trim().toUpperCase();

    if (!cleanCode) {
      alert("Masukkan room code terlebih dahulu.");
      return;
    }

    window.location.href = `/join?room=${cleanCode}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center">
        <div className="grid w-full gap-12 lg:grid-cols-2">
          <section className="flex flex-col justify-center">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
              Sharing Session Nija Works
            </p>

            <h1 className="max-w-xl text-5xl font-semibold tracking-tight sm:text-6xl">
              Studio After Dark
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
              Find the Werewolves before the village disappears.
              Trust carefully. Everyone has something to hide.
            </p>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-2xl font-semibold">Enter the village</h2>

            <p className="mt-2 text-sm text-slate-400">
              Create a new game as host or join using a room code.
            </p>

            <div className="mt-8 space-y-4">
              <a
                href="/create"
                className="flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 transition hover:bg-slate-200"
              >
                Create Game
              </a>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-widest text-slate-500">
                  or
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleJoin();
                    }
                  }}
                  placeholder="Example: NIGHT8"
                  maxLength={8}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-lg uppercase tracking-widest outline-none transition placeholder:text-slate-600 focus:border-white/30"
                />
              </label>

              <button
                type="button"
                onClick={handleJoin}
                className="w-full rounded-2xl border border-white/15 px-5 py-4 font-medium transition hover:bg-white/10"
              >
                Join Game
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}