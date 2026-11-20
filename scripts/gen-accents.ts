import { writeFileSync } from "node:fs";
import { generateAccentsCss } from "../lib/settings/accents";

writeFileSync(new URL("../app/accents.css", import.meta.url), generateAccentsCss());
console.log("app/accents.css written");
