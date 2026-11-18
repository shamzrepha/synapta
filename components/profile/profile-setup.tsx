"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  Sparkles,
  School,
  GraduationCap,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  FileCheck2,
  Code2,
  Calculator,
  Cpu,
  FlaskConical,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useUserStore } from "@/lib/store/use-user-store";
import { AVATAR_PRESETS, presetAvatarUrl, checkUsername } from "@/lib/profile/avatars";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import { cn } from "@/lib/utils";

type Pick = { kind: "keep" } | { kind: "preset"; index: number } | { kind: "upload"; dataUrl: string };
type Step = 1 | 2 | 3 | 4 | 5;
type EducationTier = "primary" | "secondary" | "university" | "independent";

interface RegisteredSchoolOption {
  id: string;
  name: string;
  kind: string;
  department: string;
}

const EDUCATION_TIERS: { id: EducationTier; label: string; sub: string }[] = [
  { id: "primary", label: "Primary School", sub: "Primary 1–6 • Numeracy, Literacy & Basic Science" },
  { id: "secondary", label: "Secondary / High School", sub: "JSS 1–3 & SS 1–3 • WAEC, NECO, JAMB & IGCSE" },
  { id: "university", label: "University / Polytechnic / College", sub: "100L–500L & Postgrad • Degrees, Diplomas & Courses" },
  { id: "independent", label: "Independent / Self-Learner", sub: "Anyone willing to learn • Custom topics & skills" },
];

const STREAMS_BY_TIER: Record<EducationTier, string[]> = {
  primary: [
    "General Primary Subjects",
    "Mathematics & Numeracy",
    "Basic Science & Technology",
    "English & Reading Comprehension",
    "Coding & Robotics for Kids",
    "Creative Arts & Social Studies",
  ],
  secondary: [
    "Science Stream (Physics, Chemistry, Biology, Maths)",
    "Commercial / Business Stream (Accounting, Economics, Commerce)",
    "Arts & Humanities (Literature, Government, History)",
    "Technical & Computer Studies",
    "Junior Secondary (JSS General)",
  ],
  university: [
    "Computer Science",
    "Mechanical Engineering",
    "Electrical & Electronics Engineering",
    "Medicine & Surgery",
    "Accounting",
    "Economics",
    "Law",
    "Biochemistry",
    "Pharmacy",
    "Civil Engineering",
    "Mass Communication",
    "Microbiology",
  ],
  independent: [
    "Software Engineering & AI",
    "Science & Engineering",
    "Business, Finance & Economics",
    "Languages & Communication",
    "Professional Certification Prep",
    "General Curiosity & Self-Study",
  ],
};

const LEVELS_BY_TIER: Record<EducationTier, { id: string; label: string }[]> = {
  primary: [
    { id: "Primary 1", label: "Primary 1 / Grade 1" },
    { id: "Primary 2", label: "Primary 2 / Grade 2" },
    { id: "Primary 3", label: "Primary 3 / Grade 3" },
    { id: "Primary 4", label: "Primary 4 / Grade 4" },
    { id: "Primary 5", label: "Primary 5 / Grade 5" },
    { id: "Primary 6", label: "Primary 6 / Common Entrance" },
  ],
  secondary: [
    { id: "JSS 1", label: "JSS 1 (Grade 7)" },
    { id: "JSS 2", label: "JSS 2 (Grade 8)" },
    { id: "JSS 3", label: "JSS 3 (BECE / Junior WAEC)" },
    { id: "SS 1", label: "SS 1 (Grade 10)" },
    { id: "SS 2", label: "SS 2 (Grade 11)" },
    { id: "SS 3", label: "SS 3 (WAEC / NECO / JAMB)" },
  ],
  university: [
    { id: "100L", label: "100 Level (Year 1)" },
    { id: "200L", label: "200 Level (Year 2)" },
    { id: "300L", label: "300 Level (Year 3)" },
    { id: "400L", label: "400 Level (Year 4)" },
    { id: "500L", label: "500 Level (Year 5)" },
    { id: "Postgraduate", label: "Postgraduate / Master's" },
  ],
  independent: [
    { id: "Self-Paced Foundation", label: "Foundation / Beginner" },
    { id: "Self-Paced Intermediate", label: "Intermediate Learner" },
    { id: "Self-Paced Advanced", label: "Advanced / Mastery" },
    { id: "Exam & Certification Prep", label: "Exam / Certification Prep" },
  ],
};

const INTEREST_TAGS = [
  { id: "past_questions", label: "Past Questions & Exam Drills", desc: "Step-by-step worked exam questions", Icon: FileCheck2 },
  { id: "programming", label: "Programming & Algorithms", desc: "Python, C++, Data structures", Icon: Code2 },
  { id: "math", label: "Mathematics & Calculus", desc: "Step-by-step formulas & derivations", Icon: Calculator },
  { id: "circuits", label: "3D Circuits & Hardware Labs", desc: "Interactive breadboards and robotics", Icon: Cpu },
  { id: "sciences", label: "Sciences & Chemistry", desc: "Reaction mechanics, biology, physics", Icon: FlaskConical },
  { id: "business", label: "Business & Economics", desc: "Financial models, accounting, commerce", Icon: TrendingUp },
];

/** Shrinks an uploaded picture to a centred square JPEG */
async function shrink(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** Global event listener to let banners open the academic setup */
export function openAcademicSetup() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sunroot:open-academic-setup"));
  }
}

function clampStep(n: number): Step {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

/**
 * Sprout's 5-step animated onboarding questionnaire.
 * Gathers handle, avatar, institution, department, level, and goals,
 * calibrating course recommendations and walking the student through study plans.
 */
export function ProfileSetup() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);

  const [step, setStep] = useState<Step>(1);
  const [forceOpen, setForceOpen] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);

  // Form states (null means use existing user profile field until edited)
  const [handleDraft, setHandleDraft] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [tierDraft, setTierDraft] = useState<EducationTier>("secondary");
  const [registeredSchools, setRegisteredSchools] = useState<RegisteredSchoolOption[]>([]);
  const [institutionDraft, setInstitutionDraft] = useState<string | null>(null);
  const [departmentDraft, setDepartmentDraft] = useState<string | null>(null);
  const [levelDraft, setLevelDraft] = useState<string | null>(null);
  const [interestsDraft, setInterestsDraft] = useState<string[] | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Only load the school list when the setup screen is actually open, not on every page of the app
  const wantsSetup = Boolean(user && (user.profileSetup === false || forceOpen));
  useEffect(() => {
    if (!wantsSetup) return;
    let live = true;
    fetch("/api/schools?mode=directory")
      .then((r) => r.json())
      .then((j) => {
        if (live && j?.ok && Array.isArray(j.data?.registeredSchools)) {
          setRegisteredSchools(j.data.registeredSchools);
        }
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [wantsSetup]);

  useEffect(() => {
    const onOpen = () => {
      setDismissedForSession(false);
      setForceOpen(true);
    };
    window.addEventListener("sunroot:open-academic-setup", onOpen);
    return () => window.removeEventListener("sunroot:open-academic-setup", onOpen);
  }, []);

  // Automatically claim any pending campus referral link (?ref=<username>) saved during login or signup
  useEffect(() => {
    if (!user?.uid) return;
    let pending = "";
    try {
      pending = (window.localStorage.getItem("sunroot:pending_ref") || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 24);
      if (pending) {
        window.localStorage.removeItem("sunroot:pending_ref");
      }
    } catch {
      return;
    }
    if (pending.length < 3 || pending === (user.username || "").toLowerCase()) return;

    fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerUsername: pending }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data?.xpAwarded) {
          updateUser({ xp: (user.xp || 0) + Number(j.data.xpAwarded) });
        } else if (j?.error?.code === "EMAIL_UNVERIFIED") {
          // try again after they confirm their email
          try {
            window.localStorage.setItem("sunroot:pending_ref", pending);
          } catch {
            // ignore storage errors
          }
        }
      })
      .catch(() => null);
  }, [user?.uid, user?.username, user?.xp, updateUser]);

  const isOpen = Boolean(user && !dismissedForSession && (user.profileSetup === false || forceOpen));
  if (!isOpen || !user) return null;

  const closeOverlay = () => {
    setForceOpen(false);
    setDismissedForSession(true);
  };

  const value = handleDraft ?? user.username ?? "";
  const institution = institutionDraft ?? user.institution ?? "";
  const department = departmentDraft ?? user.department ?? "";
  const level = levelDraft ?? user.level ?? "100L";
  const interests =
    interestsDraft ?? (user.interests && user.interests.length > 0 ? user.interests : ["past_questions"]);

  const choice: Pick = pick ?? (user.photoURL ? { kind: "keep" } : { kind: "preset", index: 0 });
  const preview =
    choice.kind === "upload" ? uploadPreview : choice.kind === "preset" ? presetAvatarUrl(choice.index) : user.photoURL;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      const dataUrl = await shrink(f);
      setUploadPreview(dataUrl);
      setPick({ kind: "upload", dataUrl });
    } catch {
      setError("That file could not be read as a picture. Try a JPEG or PNG.");
    }
  };

  const toggleInterest = (id: string) => {
    const next = interests.includes(id) ? interests.filter((x) => x !== id) : [...interests, id];
    setInterestsDraft(next);
  };

  const save = async (redirectToPlan = false) => {
    setError("");
    const name = checkUsername(value);
    if (!name.ok) {
      setStep(1);
      setError(name.message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: name.username,
          avatar: choice,
          institution: institution.trim() || undefined,
          department: department.trim() || undefined,
          level: level.trim() || undefined,
          interests,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.error?.message || "Couldn't save that. Try again.");
        return;
      }
      updateUser({
        username: j.data.username,
        photoURL: j.data.photoURL ?? user.photoURL,
        institution: j.data.institution,
        department: j.data.department,
        level: j.data.level,
        interests: j.data.interests,
        profileSetup: true,
      });
      setForceOpen(false);
      setDismissedForSession(true);
      if (redirectToPlan) {
        router.push("/plans");
      }
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Sprout pose per step
  const sproutPose: BotPose =
    step === 1 ? "wave" : step === 2 ? "search" : step === 3 ? "jump" : step === 4 ? "think" : "dance";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-setup-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card text-foreground shadow-2xl p-4 sm:p-6 space-y-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in fade-in zoom-in-95 duration-200 relative">
        {/* Progress bar & Dismiss button */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
            <span>Setup Quest — Step {step} of 5</span>
            <div className="flex items-center gap-2">
              <span>{step * 20}%</span>
              <button
                type="button"
                onClick={closeOverlay}
                aria-label="Skip setup for now"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300 ease-out"
              style={{ width: `${step * 20}%` }}
            />
          </div>
        </div>

        {/* Sprout host dialogue card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-950 dark:text-brand-100">
          <div className="relative w-11 h-13 shrink-0 flex items-center justify-center">
            <Sprout pose={sproutPose} />
          </div>
          <div className="text-xs sm:text-sm min-w-0 break-words">
            {step === 1 && (
              <p>
                <strong>Beep boop! I&apos;m Sprout.</strong> Let&apos;s get your profile set up so everyone knows who you are!
              </p>
            )}
            {step === 2 && (
              <p>
                <strong>Which school are you attending?</strong> I&apos;ll link you to courses taught right on your campus.
              </p>
            )}
            {step === 3 && (
              <p>
                <strong>What are you studying?</strong> Tell me your department and year so I can tailor the syllabus.
              </p>
            )}
            {step === 4 && (
              <p>
                <strong>What&apos;s your focus this semester?</strong> Pick the areas you want me to help you master!
              </p>
            )}
            {step === 5 && (
              <p>
                <strong>All set!</strong> We&apos;ve mapped courses for {department || "your department"} at{" "}
                {institution || "your university"}. Choose how you&apos;d like to study!
              </p>
            )}
          </div>
        </div>

        {/* STEP 1: Username & Avatar */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 id="profile-setup-title" className="text-base sm:text-lg font-bold">
                Pick your call-sign & picture
              </h2>
              <p className="text-xs text-muted-foreground">
                Your friends and coursemates will see this on class leaderboards.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Avatar name={user.displayName || "?"} photoURL={preview} size={56} />
              <div className="flex-1 min-w-0">
                <label htmlFor="setup-handle" className="text-xs font-semibold text-muted-foreground">
                  Username
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">@</span>
                  <Input
                    id="setup-handle"
                    value={value}
                    onChange={(e) => {
                      setHandleDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    }}
                    maxLength={24}
                    placeholder="student_hero"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Starter Avatars</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 justify-items-center">
                {AVATAR_PRESETS.map((_, i) => {
                  const on = choice.kind === "preset" && choice.index === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPick({ kind: "preset", index: i })}
                      aria-label={`Starter picture ${i + 1}`}
                      aria-pressed={on}
                      className={cn(
                        "relative rounded-full ring-2 ring-offset-2 ring-offset-card transition",
                        on ? "ring-brand-600" : "ring-transparent hover:ring-slate-300"
                      )}
                    >
                      <Avatar name="" photoURL={presetAvatarUrl(i)} size={42} />
                      {on && (
                        <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-brand-600 p-0.5 text-white" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                  aria-label="Upload a picture"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-1.5 h-4 w-4" /> Upload picture
                </Button>
                {user.photoURL && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPick({ kind: "keep" })}
                    aria-pressed={choice.kind === "keep"}
                  >
                    Keep Google photo
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Education Category & School */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <School className="h-5 w-5 text-brand-600 shrink-0" /> How are you learning on SunRoot?
              </h2>
              <p className="text-xs text-muted-foreground">
                SunRoot is built for Primary Schools, Secondary Schools, Universities, and independent learners.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EDUCATION_TIERS.map((t) => {
                const active = tierDraft === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTierDraft(t.id);
                      const firstLvl = LEVELS_BY_TIER[t.id][0]?.id;
                      if (firstLvl) setLevelDraft(firstLvl);
                      if (t.id === "independent" && !institutionDraft) {
                        setInstitutionDraft("Independent Learner");
                      }
                    }}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition flex flex-col justify-between",
                      active
                        ? "bg-brand-50 dark:bg-brand-950/40 border-brand-600 ring-1 ring-brand-600"
                        : "bg-slate-50 dark:bg-slate-800 border-border hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-foreground">{t.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block">
                {tierDraft === "independent"
                  ? "Learning Community or School Name (Optional)"
                  : "Your School or Institution Name"}
              </label>
              <Input
                placeholder={
                  tierDraft === "primary"
                    ? "Type your primary school name..."
                    : tierDraft === "secondary"
                    ? "Type your secondary school name..."
                    : tierDraft === "university"
                    ? "Type your university, polytechnic, or college..."
                    : "Independent Learner (or type your academy/group)..."
                }
                value={institution}
                onChange={(e) => setInstitutionDraft(e.target.value)}
              />
              {registeredSchools.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground pt-1">
                    Schools on SunRoot (tap to pick yours; your school gives you an invite code to join it):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {registeredSchools.map((sch) => (
                      <button
                        key={sch.id}
                        type="button"
                        onClick={() => setInstitutionDraft(sch.name)}
                        className={cn(
                          "text-xs px-2.5 py-1.5 rounded-lg border transition text-left",
                          institution === sch.name
                            ? "bg-brand-600 text-white border-brand-600 font-semibold"
                            : "bg-slate-50 dark:bg-slate-800 border-border hover:border-brand-500"
                        )}
                      >
                        {sch.name} <span className="opacity-70 text-[10px]">({sch.kind})</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Class Stream / Department & Grade Level */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-brand-600 shrink-0" />{" "}
                {tierDraft === "primary" || tierDraft === "secondary"
                  ? "Subject Stream & Class Grade"
                  : tierDraft === "independent"
                  ? "Focus Area & Pace"
                  : "Department & Year Level"}
              </h2>
              <p className="text-xs text-muted-foreground">
                We use this to calibrate your lessons, interactive science labs, and past exam practice.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {tierDraft === "primary" || tierDraft === "secondary"
                    ? "Class Stream / Subject Focus"
                    : "Department / Major / Focus Area"}
                </label>
                <Input
                  placeholder={
                    tierDraft === "primary"
                      ? "e.g. Numeracy & Basic Science"
                      : tierDraft === "secondary"
                      ? "e.g. Science Stream, Arts, or Commercial"
                      : "e.g. Computer Science, Medicine, Accounting..."
                  }
                  value={department}
                  onChange={(e) => setDepartmentDraft(e.target.value)}
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {STREAMS_BY_TIER[tierDraft].slice(0, 6).map((dep) => (
                    <button
                      key={dep}
                      type="button"
                      onClick={() => setDepartmentDraft(dep)}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-md border transition",
                        department === dep
                          ? "bg-brand-600 text-white border-brand-600 font-semibold"
                          : "bg-slate-50 dark:bg-slate-800 border-border hover:border-brand-500"
                      )}
                    >
                      {dep}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Current Grade / Study Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LEVELS_BY_TIER[tierDraft].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setLevelDraft(lvl.id)}
                      className={cn(
                        "text-xs p-2.5 rounded-xl border text-left flex items-center justify-between transition",
                        level === lvl.id
                          ? "bg-brand-50 dark:bg-brand-950/40 border-brand-600 text-brand-700 dark:text-brand-300 font-semibold ring-1 ring-brand-600"
                          : "bg-slate-50 dark:bg-slate-800 border-border hover:border-slate-300"
                      )}
                    >
                      <span>{lvl.label}</span>
                      {level === lvl.id && <Check className="h-4 w-4 text-brand-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Goals & Interests */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-brand-600 shrink-0" /> What do you want Sprout to help you master?
              </h2>
              <p className="text-xs text-muted-foreground">Select everything you are aiming to conquer this semester.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {INTEREST_TAGS.map((tag) => {
                const active = interests.includes(tag.id);
                const Icon = tag.Icon;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleInterest(tag.id)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition flex flex-col justify-between",
                      active
                        ? "bg-brand-50 dark:bg-brand-950/40 border-brand-600 ring-1 ring-brand-600"
                        : "bg-slate-50 dark:bg-slate-800 border-border hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between w-full gap-1.5">
                      <span className="text-xs font-bold flex items-center gap-1.5 min-w-0">
                        <Icon className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                        <span className="truncate">{tag.label}</span>
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{tag.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 5: Study Plan & Recommendation Guide */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 shrink-0" /> Recommended Study Pass
              </h2>
              <p className="text-xs text-muted-foreground">
                Choose the pass that fits your study style. You can always start free and upgrade during exam season.
              </p>
            </div>

            <div className="space-y-3">
              {/* Option A: Plus Semester Pass */}
              <div className="p-3.5 rounded-xl border-2 border-brand-600 bg-brand-50/50 dark:bg-brand-950/20 relative space-y-1.5">
                <span className=" inline-block sm:absolute sm:-top-2.5 sm:right-3 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white">
                  Best Value — 135 Days
                </span>
                <div className="flex justify-between items-baseline gap-2">
                  <h3 className="text-sm font-bold text-brand-900 dark:text-brand-200">Plus Semester Pass</h3>
                  <span className="text-base font-extrabold text-brand-600 shrink-0">₦11,000</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Covers full 4.5 months through final exams. Unlocks own PDF uploads, 3D Maker Studio labs, audio podcasts, and all past questions at no extra cost.
                </p>
              </div>

              {/* Option B: Exam Month Pass */}
              <div className="p-3 rounded-xl border border-border bg-slate-50 dark:bg-slate-800/50 space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <h3 className="text-sm font-bold">Exam Month Pass</h3>
                  <span className="text-sm font-bold text-foreground shrink-0">₦1,500 / month</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Intensive 30-day exam access: Step-by-step Past Questions solver, CBT simulator, and handwritten paper grading.
                </p>
              </div>

              {/* Option C: Free Tier */}
              <div className="p-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground flex flex-wrap justify-between items-center gap-2">
                <span>Free Seed Tier: Read class notes & 3 preview courses</span>
                <span className="font-semibold text-foreground">₦0 Free</span>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {error}
          </p>
        )}

        {/* Navigation Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {step > 1 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => clampStep(s - 1))}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={closeOverlay} className="text-xs text-muted-foreground">
              Skip for now
            </Button>
          )}

          {step < 5 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (step === 1 && value.length < 3) {
                  setError("Username must be at least 3 characters.");
                  return;
                }
                setError("");
                setStep((s) => clampStep(s + 1));
              }}
              className="ml-auto"
            >
              Continue <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Button type="button" variant="outline" size="sm" onClick={() => void save(false)} isLoading={busy}>
                Start Free
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save(true)}
                isLoading={busy}
                className="bg-brand-600 hover:bg-brand-700 text-white"
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Get Semester Pass
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
