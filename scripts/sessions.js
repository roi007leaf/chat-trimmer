/** Session changes share one path so archives retain their previous session. */
export function validateSessionNumber(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error("Session number must be a positive whole number.");
  }
}

export async function setCurrentSession(number) {
  if (!game.user.isGM) throw new Error("Only GMs can manage sessions.");
  validateSessionNumber(number);
  await game.settings.set("chat-trimmer", "currentSessionNumber", number);
  await game.settings.set(
    "chat-trimmer",
    "currentSessionName",
    `Session ${number}`,
  );
}

let starting = false;
export async function startNextSession(trimmer, number) {
  if (!game.user.isGM) throw new Error("Only GMs can manage sessions.");
  validateSessionNumber(number);
  if (starting) throw new Error("Session change already in progress.");
  starting = true;
  try {
    if (game.settings.get("chat-trimmer", "archiveOnNewSession")) {
      if (!game.settings.get("chat-trimmer", "enableArchiving")) {
        throw new Error(
          "Enable archiving before starting a session with automatic archiving.",
        );
      }
      if (game.messages.contents.length) {
        const result = await trimmer.trim(null, { ignoreKeep: true });
        if (!result?.archive)
          throw new Error(
            "Previous session could not be archived. Session unchanged.",
          );
      }
    }
    await setCurrentSession(number);
    await game.settings.set(
      "chat-trimmer",
      "currentSessionStartTime",
      Date.now(),
    );
  } finally {
    starting = false;
  }
}
