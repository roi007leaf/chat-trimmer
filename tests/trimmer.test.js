import { ChatTrimmer } from "../scripts/trimmer.js";

describe("ChatTrimmer.formatIndividualDisplay", () => {
  test("formats damage application summaries as damage instead of spell casts", () => {
    const trimmer = new ChatTrimmer();
    const message = {
      content: "<p>Damage Taken</p>",
      flavor: "<strong>Fireball</strong>",
      flags: {
        pf2e: {
          origin: {
            type: "spell",
            item: { name: "Fireball" },
          },
          context: {},
        },
      },
      speaker: {
        alias: "Wizard",
      },
      rolls: [{ total: 18 }],
    };

    expect(trimmer.formatIndividualDisplay(message)).toContain("Damage");
    expect(trimmer.formatIndividualDisplay(message)).toContain("⚔️");
    expect(trimmer.formatIndividualDisplay(message)).not.toContain(
      "✨ Wizard: Fireball",
    );
  });
});

describe("ChatTrimmer.isKeyEvent", () => {
  test("ignores encounter round marker messages", () => {
    const trimmer = new ChatTrimmer();
    const message = {
      content: "<p>Round 2</p>",
      flavor: "",
      flags: {
        "monks-combat-details": {
          round: 2,
        },
      },
      rolls: [],
    };

    expect(trimmer.isKeyEvent(message)).toBe(false);
  });
});
