import type { LanguageCode } from "./languages";

/**
 * The app's own words that every learner sees first: the main menu, search and the language picker. Everything the AI
 * writes (notes, quizzes, tutor answers, podcasts) is produced directly in the chosen language instead.
 */
type Table = Record<string, string>;

const pcm: Table = {
  Home: "Home", "My classes": "My class dem", "Notebook & Studio": "Notebook & Studio", Community: "Community", Saved: "Wetin I save",
  Profile: "My profile", Everything: "Everytin", "Admin Console": "Admin", More: "More",
  "Your daily path": "Your daily road", "Your courses · find new ones": "Your course dem · find new ones", "Study alone · build things": "Study alone · build tins",
  "Study together": "Make we study together", "Every feature, searchable": "All di features, you fit search am",
  "Search people, classes, topics, #tags…": "Search people, class, topic, #tags…", Back: "Go back", Language: "Language",
  "The AI teaches, quizzes and talks to you in this language.": "Di AI go teach, quiz and yarn with you for dis language.",
};
const yo: Table = {
  Home: "Ilé", "My classes": "Àwọn kíláàsì mi", "Notebook & Studio": "Ìwé àkọsílẹ̀ & Ilé-iṣẹ́", Community: "Àwùjọ", Saved: "Èyí tí mo fipamọ́",
  Profile: "Profaili mi", Everything: "Gbogbo nǹkan", "Admin Console": "Ìṣàkóso", More: "Síwájú sí i",
  "Your daily path": "Ọ̀nà ojoojúmọ́ rẹ", "Your courses · find new ones": "Àwọn ẹ̀kọ́ rẹ · wá tuntun", "Study alone · build things": "Kàwé nìkan · kọ́ nǹkan",
  "Study together": "Ẹ jọ kàwé", "Every feature, searchable": "Gbogbo ohun èlò, ó ṣeé wá",
  "Search people, classes, topics, #tags…": "Wá ènìyàn, kíláàsì, kókó ẹ̀kọ́…", Back: "Padà", Language: "Èdè",
  "The AI teaches, quizzes and talks to you in this language.": "AI yóò kọ́ ọ, bi ọ́ ní ìbéèrè, yóò sì bá ọ sọ̀rọ̀ ní èdè yìí.",
};
const ig: Table = {
  Home: "Ụlọ", "My classes": "Klas m", "Notebook & Studio": "Akwụkwọ ndetu & Studio", Community: "Obodo", Saved: "Ihe m chekwara",
  Profile: "Profaịlụ m", Everything: "Ihe niile", "Admin Console": "Njikwa", More: "Ọzọ",
  "Your daily path": "Ụzọ gị kwa ụbọchị", "Your courses · find new ones": "Ọmụmụ gị · chọta ndị ọhụrụ", "Study alone · build things": "Mụta naanị gị · wuo ihe",
  "Study together": "Mụtaa ọnụ", "Every feature, searchable": "Atụmatụ niile, enwere ike ịchọ ha",
  "Search people, classes, topics, #tags…": "Chọọ ndị mmadụ, klas, isiokwu…", Back: "Laghachi", Language: "Asụsụ",
  "The AI teaches, quizzes and talks to you in this language.": "AI ga-akụzi, jụọ ajụjụ ma soro gị kwuo okwu n'asụsụ a.",
};
const ha: Table = {
  Home: "Gida", "My classes": "Azuzuwana", "Notebook & Studio": "Littafin rubutu & Studio", Community: "Al'umma", Saved: "Abin da na ajiye",
  Profile: "Bayanaina", Everything: "Komai", "Admin Console": "Gudanarwa", More: "Ƙari",
  "Your daily path": "Hanyarka ta yau da kullum", "Your courses · find new ones": "Darussanka · nemo sababbi", "Study alone · build things": "Karatu kai kaɗai · gina abubuwa",
  "Study together": "Karatu tare", "Every feature, searchable": "Duk fasaloli, ana iya nema",
  "Search people, classes, topics, #tags…": "Nemo mutane, azuzuwa, batutuwa…", Back: "Koma", Language: "Harshe",
  "The AI teaches, quizzes and talks to you in this language.": "AI zai koyar, ya yi maka tambayoyi kuma ya yi magana da kai a wannan harshe.",
};
const fr: Table = {
  Home: "Accueil", "My classes": "Mes classes", "Notebook & Studio": "Carnet & Studio", Community: "Communauté", Saved: "Enregistrés",
  Profile: "Profil", Everything: "Tout", "Admin Console": "Console admin", More: "Plus",
  "Your daily path": "Ton parcours du jour", "Your courses · find new ones": "Tes cours · trouves-en d'autres", "Study alone · build things": "Étudier seul · construire",
  "Study together": "Étudier ensemble", "Every feature, searchable": "Toutes les fonctions, avec recherche",
  "Search people, classes, topics, #tags…": "Rechercher des personnes, classes, sujets, #tags…", Back: "Retour", Language: "Langue",
  "The AI teaches, quizzes and talks to you in this language.": "L'IA t'enseigne, t'interroge et te parle dans cette langue.",
};
const ar: Table = {
  Home: "الرئيسية", "My classes": "فصولي", "Notebook & Studio": "الدفتر والاستوديو", Community: "المجتمع", Saved: "المحفوظات",
  Profile: "ملفي", Everything: "كل شيء", "Admin Console": "لوحة الإدارة", More: "المزيد",
  "Your daily path": "مسارك اليومي", "Your courses · find new ones": "دوراتك · ابحث عن جديدة", "Study alone · build things": "ادرس وحدك · ابنِ أشياء",
  "Study together": "ادرسوا معًا", "Every feature, searchable": "كل الميزات، قابلة للبحث",
  "Search people, classes, topics, #tags…": "ابحث عن أشخاص وفصول ومواضيع…", Back: "رجوع", Language: "اللغة",
  "The AI teaches, quizzes and talks to you in this language.": "يعلّمك الذكاء الاصطناعي ويختبرك ويتحدث إليك بهذه اللغة.",
};
const sw: Table = {
  Home: "Nyumbani", "My classes": "Madarasa yangu", "Notebook & Studio": "Daftari & Studio", Community: "Jumuiya", Saved: "Vilivyohifadhiwa",
  Profile: "Wasifu wangu", Everything: "Kila kitu", "Admin Console": "Usimamizi", More: "Zaidi",
  "Your daily path": "Njia yako ya kila siku", "Your courses · find new ones": "Kozi zako · tafuta mpya", "Study alone · build things": "Soma peke yako · jenga vitu",
  "Study together": "Someni pamoja", "Every feature, searchable": "Vipengele vyote, vinatafutika",
  "Search people, classes, topics, #tags…": "Tafuta watu, madarasa, mada…", Back: "Rudi", Language: "Lugha",
  "The AI teaches, quizzes and talks to you in this language.": "AI itakufundisha, itakuuliza maswali na kuzungumza nawe kwa lugha hii.",
};

const TABLES: Partial<Record<LanguageCode, Table>> = { pcm, yo, ig, ha, fr, ar, sw };

/** The UI word in the learner's language, or the English original when there is no translation. */
export function translate(lang: LanguageCode, text: string): string {
  return TABLES[lang]?.[text] ?? text;
}

/** Every key each language must cover (used by the test so no menu item falls back to English by accident). */
export const UI_KEYS = Object.keys(fr);
export const UI_TABLES = TABLES;
