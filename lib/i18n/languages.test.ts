import { describe, it, expect } from "vitest";
import { LANGUAGES, guessSpeechLanguage, isLanguageCode, languageDirective, languageInfo } from "./languages";
import { UI_KEYS, UI_TABLES, translate } from "./ui";
import { parsePrefs } from "@/lib/settings/prefs";

describe("languages", () => {
  it("knows every listed language and falls back to English", () => {
    for (const l of LANGUAGES) expect(isLanguageCode(l.code)).toBe(true);
    expect(isLanguageCode("xx")).toBe(false);
    expect(languageInfo("nope").code).toBe("en");
  });

  it("adds no instruction for English and a clear one for others", () => {
    expect(languageDirective("en")).toBe("");
    const yo = languageDirective("yo");
    expect(yo).toContain("Yoruba");
    expect(yo).toContain("JSON keys");
    expect(languageDirective("pcm")).toContain("Pidgin");
  });

  it("guesses the language of a line well enough to pick a voice", () => {
    expect(guessSpeechLanguage("مرحبا بكم في الدرس")).toBe("ar");
    expect(guessSpeechLanguage("Ẹ kú àárọ̀, ẹ jẹ́ ká kọ́ nípa iná mànàmáná")).toBe("yo");
    expect(guessSpeechLanguage("Ndewo, ka anyị mụta banyere ọkụ eletrik")).toBe("ig");
    expect(guessSpeechLanguage("Sannu, mu koyi game da ƙarfin wutar lantarki")).toBe("ha");
    expect(guessSpeechLanguage("La tension est le produit du courant et de la résistance dans le circuit")).toBe("fr");
    expect(guessSpeechLanguage("Hii ni sehemu ya somo kuhusu umeme na jinsi ya kuwa salama katika maabara")).toBe("sw");
    expect(guessSpeechLanguage("Voltage equals current times resistance in a simple circuit")).toBeNull();
  });

  it("keeps the language in saved preferences and rejects unknown codes", () => {
    expect(parsePrefs({ language: "ha" }).language).toBe("ha");
    expect(parsePrefs({ language: "klingon" }).language).toBe("en");
  });

  it("translates every menu word in every language", () => {
    for (const [code, table] of Object.entries(UI_TABLES)) {
      for (const k of UI_KEYS) expect(table?.[k], `${code}: ${k}`).toBeTruthy();
    }
    expect(translate("fr", "Home")).toBe("Accueil");
    expect(translate("en", "Home")).toBe("Home");
    expect(translate("yo", "Something new")).toBe("Something new");
  });
});
