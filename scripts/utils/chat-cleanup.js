const installedCollections = new WeakSet();
const DELETE_BATCH_SIZE = 10;
const DELETE_PAUSE_MS = 100;

/**
 * Bound each socket response's synchronous document callbacks on every client.
 * Keep core deletion hooks and chat animations; let them settle between batches.
 */
async function clearMessages(collection) {
  // Snapshot after confirmation. Messages posted during cleanup survive.
  const ids = [
    ...new Set([
      ...collection.contents.map((message) => message.id),
      ...(collection.invalidDocumentIds ?? []),
    ]),
  ];
  for (let offset = 0; offset < ids.length; offset += DELETE_BATCH_SIZE) {
    await collection.documentClass.deleteDocuments(
      ids.slice(offset, offset + DELETE_BATCH_SIZE),
    );
    if (offset + DELETE_BATCH_SIZE < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, DELETE_PAUSE_MS));
    }
  }
  if (!collection.size) {
    for (const button of document.querySelectorAll(".jump-to-bottom")) {
      button.hidden = true;
    }
  }
}

/** Replace only the collection's clear-log entry point, retaining core's prompt. */
export function installChatCleanup(collection = game.messages) {
  if (
    !collection?.flush ||
    !collection.documentClass?.deleteDocuments ||
    !foundry.applications?.api?.DialogV2?.confirm ||
    installedCollections.has(collection)
  )
    return;

  let pending;
  collection.flush = function () {
    if (pending) return pending;
    pending = foundry.applications.api.DialogV2.confirm({
      window: { title: "CHAT.FlushTitle" },
      content: `<p><strong>${game.i18n.localize("COMMON.AreYouSure")}</strong> ${game.i18n.localize("CHAT.FlushWarning")}</p>`,
      position: {
        top: window.innerHeight - 150,
        left: window.innerWidth - 720,
      },
      yes: { callback: () => clearMessages(this) },
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
  installedCollections.add(collection);
}
