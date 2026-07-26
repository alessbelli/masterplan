import { describe, expect, it } from "vitest";
import { resolveCaption, uiCatalog } from "../src/domain/i18n";

describe("caption resolution", () => {
  const caps = [
    { locale: "fr", caption: "Pomme" },
    { locale: "en", caption: "Apple" },
  ];

  it("prefers the requested locale", () => {
    expect(resolveCaption(caps, "en")).toBe("Apple");
    expect(resolveCaption(caps, "fr")).toBe("Pomme");
  });

  it("falls back to the source locale, then to any available", () => {
    expect(resolveCaption(caps, "de", "fr")).toBe("Pomme");
    expect(resolveCaption([{ locale: "fr", caption: "Lait" }], "en", "es")).toBe("Lait");
  });

  it("never returns undefined for a nameless food", () => {
    expect(resolveCaption([], "en")).toBe("");
  });
});

describe("ui catalog", () => {
  it("returns the english base and falls back for unknown locales", () => {
    expect(uiCatalog("en")["app.title"]).toBe("masterplan");
    expect(uiCatalog("xx")["nav.foods"]).toBe("Foods");
  });
});
