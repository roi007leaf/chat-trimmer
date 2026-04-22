import fs from "fs";
import path from "path";

describe("archive viewer template", () => {
  test("renders expandable entry controls for collapsed descriptions", () => {
    const templatePath = path.resolve(
      process.cwd(),
      "templates/archive-viewer-v2.hbs",
    );
    const template = fs.readFileSync(templatePath, "utf8");

    expect(template).toContain('data-action="toggleEntry"');
    expect(template).toContain("cluster-sub-entries");
  });
});
