export type GameRole =
  | "werewolf"
  | "seer"
  | "doctor"
  | "villager";

export type GameWinner =
  | "village"
  | "werewolf"
  | null;

export function getWerewolfCount(
  playerCount: number,
) {
  if (
    playerCount >= 5 &&
    playerCount <= 7
  ) {
    return 1;
  }

  if (
    playerCount >= 8 &&
    playerCount <= 11
  ) {
    return 2;
  }

  if (
    playerCount >= 12 &&
    playerCount <= 15
  ) {
    return 3;
  }

  throw new Error(
    "Jumlah pemain harus antara 5 sampai 15.",
  );
}

export function getRoleComposition(
  playerCount: number,
) {
  const werewolfCount =
    getWerewolfCount(playerCount);

  const seerCount = 1;
  const doctorCount = 1;

  const villagerCount =
    playerCount -
    werewolfCount -
    seerCount -
    doctorCount;

  if (villagerCount < 1) {
    throw new Error(
      "Komposisi role tidak valid.",
    );
  }

  return {
    werewolfCount,
    seerCount,
    doctorCount,
    villagerCount,
  };
}

export function determineWinner({
  aliveWerewolfCount,
  aliveGoodCount,
}: {
  aliveWerewolfCount: number;
  aliveGoodCount: number;
}): GameWinner {
  if (aliveWerewolfCount === 0) {
    return "village";
  }

  if (
    aliveWerewolfCount >=
    aliveGoodCount
  ) {
    return "werewolf";
  }

  return null;
}