# SYNAPTA: CRITICAL RUNTIME EXCEPTION FIXES + COMPLETE FEATURE ROADMAP FOR ANTIGRAVITY
## Production Bug Fixes + Teacher/Analytics/Leaderboard Implementation

---

## 🚨 CRITICAL: RUNTIME EXCEPTIONS TO FIX IMMEDIATELY

### Exception #1: "S.map is not a function" in Peer Lounge
**Status:** Production crash when lounge page loads  
**Severity:** CRITICAL — Blocks all peer study functionality  
**Location:** `app/(app)/lounge/page.tsx` line 389-435

**Root Cause Analysis:**
The lounge page crashes when `rooms` array is not properly initialized or when `.map()` is called on a non-array value. This happens in two places:

1. **Line 87-88:** Data fetch might return non-array or undefined
```typescript
if (roomsJson.ok) setRooms(roomsJson.data || []);  // Should guarantee array
```

2. **Line 391:** The `.map()` call assumes `rooms` is always an array
```typescript
{rooms.map((room) => (  // This can fail if rooms is undefined, null, or an object
```

**Fix #1 - In lounge/page.tsx:**

```typescript
// Line 74-103 - Update the useEffect hook:

useEffect(() => {
  let ignore = false;
  async function loadData() {
    try {
      const [roomsRes, classesRes] = await Promise.all([
        fetch("/api/lounge/rooms"),
        fetch("/api/classes?scope=mine"),
      ]);

      const roomsJson = await roomsRes.json();
      const classesJson = await classesRes.json();

      if (!ignore) {
        // ✅ FIX: Ensure rooms is always an array, never undefined/null/object
        if (roomsJson.ok && Array.isArray(roomsJson.data)) {
          setRooms(roomsJson.data);
        } else {
          setRooms([]);  // Default to empty array
        }

        // ✅ FIX: Ensure classes is always an array
        if (classesJson.ok && Array.isArray(classesJson.data.classes)) {
          setClasses(classesJson.data.classes);
        } else {
          setClasses([]);
        }
      }
    } catch (error) {
      console.error("Failed to load lounge data:", error);
      if (!ignore) {
        setRooms([]);
        setClasses([]);  // ✅ Also reset classes to empty array
      }
    } finally {
      if (!ignore) setLoading(false);
    }
  }

  loadData();
  return () => {
    ignore = true;
  };
}, []);
```

**Fix #2 - Add type safety to state:**

```typescript
// Line 49-51 - Ensure types are explicit
const [rooms, setRooms] = useState<RoomSummary[]>([]);  // ✅ Default empty array
const [loading, setLoading] = useState(true);
const [classes, setClasses] = useState<ClassOption[]>([]);  // ✅ Default empty array
```

**Fix #3 - Validate before rendering (defensive programming):**

```typescript
// Line 389-437 - Add null checks before .map()
{Array.isArray(rooms) && rooms.length > 0 ? (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {rooms.map((room) => (
      // ... room card JSX ...
    ))}
  </div>
) : (
  <Card className="p-12 text-center space-y-3 border border-dashed">
    <Users className="h-8 w-8 text-slate-400 mx-auto" />
    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
      No active study rooms right now
    </h4>
    {/* ... existing empty state JSX ... */}
  </Card>
)}
```

**Test Plan for Fix #1:**
```bash
# 1. Test with empty rooms
curl http://localhost:3000/api/lounge/rooms
# Should return: { ok: true, data: [] }

# 2. Load lounge page — should NOT crash
# Verify console for errors
curl http://localhost:3000/app/lounge

# 3. Test with populated rooms — should render correctly
# Add a room via API first, then reload page
```

---

### Exception #2: Notebook Button Not Visible on Mobile
**Status:** Feature blocked on mobile devices  
**Severity:** HIGH — Breaks NotebookLM access for mobile students  
**Location:** `components/shell/mobile-nav.tsx` and `app/(app)/notebook/page.tsx`

**Root Cause Analysis:**
Mobile navigation (`mobile-nav.tsx`) only shows 5 fixed tabs: Dashboard, Explore, Friends, Lounge, and either Heatmap or Profile. Notebook is NOT in the mobile nav, so students on phones cannot access `/notebook`.

**Current mobile-nav.tsx (lines 14-24):**
```typescript
const items = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Explore", href: "/explore", icon: Compass },
  { label: "Friends", href: "/friends", icon: MessageSquare },
  { label: "Lounge", href: "/lounge", icon: Users },
  ...(userRole === "teacher" || userRole === "admin"
    ? [{ label: "Heatmap", href: "/classes/heatmap", icon: Activity }]
    : [{ label: "Profile", href: "/profile", icon: User }]),
];
```

**Problem:** Notebook is missing! Only 5 tabs fit on mobile, but we need at least 6 features visible.

**Fix #2 - Replace Mobile Nav with Scrollable Tab Bar:**

Replace `components/shell/mobile-nav.tsx` entirely:

```typescript
"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Users,
  MessageSquare,
  Activity,
  User,
  BookOpen,
  Menu,
} from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useUserStore();
  const userRole = user?.role || "student";
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ✅ FIX: ALL features accessible, scrollable on mobile
  const allItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Explore", href: "/explore", icon: Compass },
    { label: "Notebook", href: "/notebook", icon: BookOpen },  // ✅ ADDED
    { label: "Lounge", href: "/lounge", icon: Users },
    { label: "Friends", href: "/friends", icon: MessageSquare },
    ...(userRole === "teacher" || userRole === "admin"
      ? [{ label: "Heatmap", href: "/classes/heatmap", icon: Activity }]
      : [{ label: "Profile", href: "/profile", icon: User }]),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-lg dark:border-slate-800/80 dark:bg-slate-950/95"
      aria-label="Mobile Navigation"
    >
      {/* ✅ FIX: Scrollable container for tabs that don't fit */}
      <div
        ref={scrollContainerRef}
        className="flex items-center overflow-x-auto scrollbar-hide h-14 px-1"
        style={{ scrollBehavior: "smooth" }}
      >
        {allItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center shrink-0 h-full min-h-[56px] min-w-[56px] text-[10px] font-medium transition-colors select-none px-2",
                isActive
                  ? "text-teal-600 dark:text-teal-400 font-semibold"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 mb-0.5",
                  isActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-slate-400 dark:text-slate-500"
                )}
              />
              <span className="text-[10px] leading-tight truncate max-w-[52px] text-center">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ✅ Hide scrollbar for cleaner look */}
      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </nav>
  );
}
```

**Fix #3 - Update Notebook Page Mobile Responsiveness:**

File: `app/(app)/notebook/page.tsx` (line 1-100, check responsive grid)

Add/verify these classes for mobile:

```typescript
// Ensure the layout is responsive on mobile

// For the main 3-pane layout:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-120px)]">
  {/* Left panel: Sources */}
  <div className="lg:col-span-1 overflow-y-auto border-r border-slate-200 dark:border-slate-800 hidden lg:block">
    {/* Sources list */}
  </div>

  {/* Middle panel: Chat/Artifacts (ALWAYS visible on mobile) */}
  <div className="lg:col-span-1 flex flex-col overflow-hidden">
    {/* Chat interface */}
  </div>

  {/* Right panel: Audio/Notes (collapsible on mobile) */}
  <div className="lg:col-span-1 overflow-y-auto hidden lg:block">
    {/* Audio & notes */}
  </div>
</div>

// ✅ Add mobile-optimized tabs to show different sections:
<div className="lg:hidden flex gap-2 border-b border-slate-200 dark:border-slate-800 mb-4">
  <Button
    variant={activeTab === "chat" ? "default" : "ghost"}
    size="sm"
    onClick={() => setActiveTab("chat")}
  >
    Chat
  </Button>
  <Button
    variant={activeTab === "sources" ? "default" : "ghost"}
    size="sm"
    onClick={() => setActiveTab("sources")}
  >
    Sources
  </Button>
  <Button
    variant={activeTab === "audio" ? "default" : "ghost"}
    size="sm"
    onClick={() => setActiveTab("audio")}
  >
    Audio
  </Button>
</div>
```

**Test Plan for Fix #2:**
```bash
# 1. Open on mobile (use Chrome DevTools mobile emulation)
# 2. Verify Notebook button is visible in bottom nav
# 3. Click Notebook → should load /notebook without error
# 4. Verify 3-pane layout is responsive (stacks on mobile)
# 5. Check that all nav items are scrollable if needed
```

---

## PART 2: DATABASE SCHEMA FIXES

### Schema Issue: API Returns Non-Array Data

**File:** `app/api/classes/route.ts` line 119

**Problem:** When fetching classes, the response wraps data incorrectly:
```typescript
// WRONG:
return NextResponse.json({ ok: true, data: { classes } });

// This makes lounge.tsx line 88 expect data.classes, but returns data directly
```

**Fix:**

```typescript
// Correct: In app/api/classes/route.ts line 119

// For ?scope=mine (teacher view)
return NextResponse.json({ 
  ok: true, 
  data: classes  // ✅ Direct array, not { classes }
});

// For explore scope (student view)
return NextResponse.json({ 
  ok: true, 
  data: classes  // ✅ Direct array
});
```

**Update lounge/page.tsx to match:**

```typescript
// Line 87-89
if (roomsJson.ok && Array.isArray(roomsJson.data)) {
  setRooms(roomsJson.data);
}

// Line 88 - classes endpoint returns { classes: [...] }
if (classesJson.ok && Array.isArray(classesJson.data)) {  // ✅ data is array
  setClasses(classesJson.data);
}
```

---

## PART 3: COMPLETE IMPLEMENTATION ROADMAP

### Phase 0: Emergency Hotfixes (Week 1 — THIS WEEK)

**All Critical:**
- [ ] Fix lounge S.map crash (add array validation)
- [ ] Fix notebook button mobile visibility (scrollable nav)
- [ ] Fix notebook page mobile responsiveness
- [ ] Fix classes API response format consistency
- [ ] Test all lounge endpoints return proper arrays
- [ ] Test notebook loads on iPhone/Android

**Deployment:**
```bash
npm run lint  # Should pass
npm test     # BKT tests should pass
npm run build  # Production build
git commit -m "Hotfix: Lounge S.map exception + Mobile notebook visibility"
```

---

### Phase 1: Teacher Class Management (Week 2)

**Files to Create:**
- `app/(app)/classes/manage/page.tsx` — Teacher dashboard
- `components/teacher/ClassWizard.tsx` — AI-guided creation
- `app/api/ai/class-builder/route.ts` — Gemini syllabus generation

**Endpoints:**
- `POST /api/ai/class-builder` — Generate syllabus with AI
- `GET /api/classes?scope=mine` — Teacher's classes
- `GET /api/classes/[id]/heatmap` — Analytics (already exists)

**UI Components:**
- Class card with stats (student count, avg mastery, last updated)
- "Create with AI" button → step-by-step wizard
- Quick actions: View Heatmap, Manage Students, Edit Syllabus

---

### Phase 2: Advanced Analytics (Week 3)

**Files to Create:**
- `components/teacher/StudentProfileModal.tsx` — Individual drill-down
- `components/teacher/CohortAnalytics.tsx` — Class trends
- `app/api/classes/[id]/students/[uid]/insights` — AI recommendations

**Features:**
- Per-student mastery radar
- Struggling concepts identification
- AI-suggested interventions
- Timeline of attempts/submissions
- Send custom messages to students

---

### Phase 3: AI Co-Pilot (Week 4)

**Files to Create:**
- `app/api/ai/lesson-planner/route.ts`
- `app/api/ai/misconception-analyzer/route.ts`
- `app/api/ai/differentiate-content/route.ts`
- `lib/gemini/prompts.ts` — Add three new prompt functions

**Features:**
- Lesson planning assistant
- Student misconception detection
- Differentiated content generation (ADHD/ASD/Gifted)

---

### Phase 4: Leaderboard System (Week 5)

**Files to Create:**
- `app/(app)/leaderboard/students/page.tsx`
- `app/(app)/leaderboard/teachers/page.tsx`
- `app/api/leaderboards/students/route.ts`
- `app/api/leaderboards/teachers/route.ts`
- `components/leaderboard/StudentLeaderboard.tsx`
- `components/leaderboard/TeacherLeaderboard.tsx`

**Features:**
- Global student rankings (XP-based)
- Teacher rankings (by student success rate)
- Class-level leaderboards
- Caching strategy for performance

---

### Phase 5: Assignments & Auto-Grading (Week 6)

**Files to Create:**
- `app/api/classes/[id]/assignments/route.ts`
- `app/api/ai/assignment-rubric/route.ts`
- `components/teacher/AssignmentBuilder.tsx`
- `components/student/AssignmentSubmission.tsx`

**Features:**
- Assignment creation with AI rubric generation
- Student submission interface
- Auto-grading with gemini-3.0-pro
- Manual teacher review for low-confidence responses

---

### Phase 6: Polish & Integration (Week 7-8)

- [ ] Wire all features to teacher dashboard
- [ ] Add notifications (student milestones, interventions needed)
- [ ] Performance optimization (caching, lazy loading)
- [ ] Comprehensive E2E testing
- [ ] Security audit (Firestore rules)
- [ ] Production deployment

---

## PART 4: DETAILED FILE-BY-FILE FIXES

### Priority 1: Lounge Page (FIX NOW)

**File:** `app/(app)/lounge/page.tsx`

Replace lines 73-103 with:

```typescript
// Load Rooms & Enrolled Classes
useEffect(() => {
  let ignore = false;
  async function loadData() {
    try {
      const [roomsRes, classesRes] = await Promise.all([
        fetch("/api/lounge/rooms"),
        fetch("/api/classes?scope=mine"),
      ]);

      const roomsJson = await roomsRes.json();
      const classesJson = await classesRes.json();

      if (!ignore) {
        // ✅ Type guards: ensure arrays, never undefined
        if (roomsJson.ok && Array.isArray(roomsJson.data)) {
          setRooms(roomsJson.data);
        } else {
          console.warn("Lounge rooms response invalid:", roomsJson);
          setRooms([]);
        }

        // ✅ Handle different response formats
        let classList: ClassOption[] = [];
        if (classesJson.ok) {
          if (Array.isArray(classesJson.data)) {
            classList = classesJson.data;
          } else if (Array.isArray(classesJson.data?.classes)) {
            classList = classesJson.data.classes;
          }
        }
        setClasses(classList);
      }
    } catch (error) {
      console.error("Failed to load lounge data:", error);
      if (!ignore) {
        setRooms([]);
        setClasses([]);
      }
    } finally {
      if (!ignore) setLoading(false);
    }
  }

  loadData();
  return () => {
    ignore = true;
  };
}, []);
```

Also, add safety check at line 391:

```typescript
{Array.isArray(rooms) && rooms.length > 0 ? (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {rooms.map((room) => (
      <Card key={room.roomCode} /* ... rest of card ... */ />
    ))}
  </div>
) : (
  <Card className="p-12 text-center space-y-3 border border-dashed">
    {/* empty state ... */}
  </Card>
)}
```

---

### Priority 2: Mobile Navigation (FIX NOW)

**File:** `components/shell/mobile-nav.tsx`

Replace entire file with the version shown in Fix #3 above.

Key changes:
- ✅ Add BookOpen import
- ✅ Add Notebook to items array
- ✅ Make nav scrollable horizontally
- ✅ Hide scrollbar with CSS

---

### Priority 3: Notebook Responsiveness (VERIFY)

**File:** `app/(app)/notebook/page.tsx`

Around line 100-200 (main layout), ensure:

```typescript
// Main layout should be responsive
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-screen lg:h-[calc(100vh-80px)]">
  {/* Left: Sources panel (hidden on mobile) */}
  <div className="hidden lg:flex flex-col">
    {/* Sources list */}
  </div>

  {/* Middle: Main chat/artifacts (always visible) */}
  <div className="lg:col-span-1 flex flex-col">
    {/* Chat interface */}
  </div>

  {/* Right: Audio/notes (hidden on mobile) */}
  <div className="hidden lg:flex flex-col">
    {/* Audio player & notes */}
  </div>
</div>

// Add mobile tabs to switch views
{/* Mobile-only tabs */}
<div className="lg:hidden flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
  <Button
    size="sm"
    variant={mobileTab === "chat" ? "default" : "ghost"}
    onClick={() => setMobileTab("chat")}
  >
    Chat
  </Button>
  <Button
    size="sm"
    variant={mobileTab === "sources" ? "default" : "ghost"}
    onClick={() => setMobileTab("sources")}
  >
    Sources
  </Button>
  <Button
    size="sm"
    variant={mobileTab === "audio" ? "default" : "ghost"}
    onClick={() => setMobileTab("audio")}
  >
    Audio
  </Button>
</div>
```

---

### Priority 4: Classes API Response (FIX NOW)

**File:** `app/api/classes/route.ts`

Verify lines 119-141 return consistent format:

```typescript
// Line 119 - For teacher "mine" scope
return NextResponse.json({ ok: true, data: classes });

// Line 140 - For student "mine" scope
return NextResponse.json({ ok: true, data: classes });

// Line 183 - For explore scope
return NextResponse.json({ ok: true, data: classes });

// ALL should return data as direct array, not wrapped
```

---

## PART 5: ENVIRONMENT & VALIDATION

**Verify `.env.local` has:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

---

## PART 6: TESTING CHECKLIST (CRITICAL)

### Unit Tests
- [ ] `rooms` array initialization in lounge (never undefined)
- [ ] `classKcs` array initialization in lounge
- [ ] API response formats return arrays, not wrapped objects
- [ ] Mobile nav renders all 6 tabs

### Integration Tests
- [ ] Load `/lounge` page → should NOT crash with "S.map is not a function"
- [ ] Click notebook in mobile nav → should navigate to `/notebook`
- [ ] On mobile, verify 3-pane notebook layout is responsive
- [ ] Fetch `/api/classes?scope=mine` → response is direct array
- [ ] Fetch `/api/lounge/rooms` → response is direct array

### E2E Tests (Manual)
```bash
# 1. Open on Chrome Desktop
curl http://localhost:3000/app/lounge
# Should load without console errors

# 2. Open on mobile (DevTools mobile mode)
# Click Notebook in bottom nav → should navigate
# Should show mobile-optimized tabs

# 3. Create a class as teacher
# Verify /api/classes?scope=mine returns array
# Verify lounge page loads without S.map error
```

---

## PART 7: DEPLOYMENT CHECKLIST

Before pushing to production:

- [ ] All console errors fixed (check DevTools)
- [ ] Mobile nav shows Notebook button
- [ ] Lounge page loads (no S.map crash)
- [ ] Notebook responsive on mobile
- [ ] `npm run lint` passes
- [ ] `npm test` passes (12/12 BKT tests)
- [ ] `npm run build` succeeds
- [ ] Firestore rules are deployed
- [ ] No TypeScript errors: `npx tsc --noEmit`

**Git Commands:**
```bash
git checkout -b hotfix/lounge-notebook-fixes
# Make changes to:
#  - app/(app)/lounge/page.tsx
#  - components/shell/mobile-nav.tsx
#  - app/(app)/notebook/page.tsx
#  - app/api/classes/route.ts

git add -A
git commit -m "Hotfix: Resolve lounge S.map crash + Add notebook to mobile nav + Fix API response formats"
git push origin hotfix/lounge-notebook-fixes
# Create PR, request review, merge to main
```

---

## PART 8: ANTIGRAVITY NEXT STEPS

**Immediate (Today):**
1. Apply all 4 Priority fixes above
2. Run test suite
3. Deploy hotfix

**This Week (Phase 0 completion):**
1. Verify no runtime exceptions on production
2. Test on real mobile devices (iPhone + Android)
3. Confirm Notebook accessible on all devices

**Next Week (Phase 1 - Teacher Management):**
1. Start `app/(app)/classes/manage/page.tsx`
2. Build `ClassWizard.tsx` component
3. Implement `/api/ai/class-builder` endpoint
4. Wire to teacher dashboard

---

## QUICK REFERENCE: ALL FILES TO MODIFY

| Priority | File | Issue | Fix |
|----------|------|-------|-----|
| 🔴 NOW | `app/(app)/lounge/page.tsx` | S.map crash | Add array validation |
| 🔴 NOW | `components/shell/mobile-nav.tsx` | Notebook hidden | Add scrollable nav with Notebook |
| 🔴 NOW | `app/(app)/notebook/page.tsx` | Not responsive | Add mobile tabs & responsive grid |
| 🔴 NOW | `app/api/classes/route.ts` | Inconsistent response | Return direct array |
| 🟡 PHASE 1 | `app/(app)/classes/manage/page.tsx` | Doesn't exist | Create teacher dashboard |
| 🟡 PHASE 1 | `components/teacher/ClassWizard.tsx` | Doesn't exist | Create AI-guided class creation |
| 🟡 PHASE 1 | `app/api/ai/class-builder/route.ts` | Doesn't exist | Create syllabus generation API |

---

**Status:** Ready for Antigravity immediate deployment  
**Estimated Time to Fix:** 2-3 hours for all critical issues  
**Estimated Time to Complete Full Roadmap:** 8 weeks (one developer)  
**Version:** 3.0 (Critical Fixes + Complete Roadmap)  
**Last Updated:** 2026-10-11
