import { create } from "zustand";

export type UserRole = "student" | "teacher" | "admin";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  roleRequest: "none" | "pending" | "approved" | "rejected";
  xp: number;
  streakDays: number;
  lastActiveDate: string | null;
  monthlyTokenLimit: number;
  monthlyTokensUsed: number;
  disabled: boolean;
}

interface UserState {
  user: UserProfile | null;
  isLoading: boolean;
  isSidebarCollapsed: boolean;
  setUser: (user: UserProfile | null) => void;
  updateUser: (partial: Partial<UserProfile>) => void;
  setIsLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: {
    uid: "mock-student-id",
    email: "student@synapta.edu",
    displayName: "Alex Rivera",
    photoURL: null,
    role: "student",
    roleRequest: "none",
    xp: 450,
    streakDays: 5,
    lastActiveDate: new Date().toISOString(),
    monthlyTokenLimit: 50000,
    monthlyTokensUsed: 1240,
    disabled: false,
  },
  isLoading: false,
  isSidebarCollapsed: false,
  setUser: (user) => set({ user }),
  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
}));
