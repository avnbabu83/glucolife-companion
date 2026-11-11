import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import moment from 'moment';
import { createPageUrl } from '@/utils';
import api from '@/api/client';
import {
  Home,
  ClipboardList,
  CalendarCheck,
  Sparkles,
  User,
  Bell,
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

// Daily Bento shell: frosted top bar (avatar, date, bell) and a frosted
// bottom tab bar (Today, Log, Plans, Insights, Profile). Every page that was
// in the old navigation is still reachable through the section pills.
const SECTIONS = [
  { name: 'Today', icon: Home, page: 'Home', hash: '', pages: ['Home'] },
  { name: 'Log', icon: ClipboardList, page: 'Glucose', pages: ['Glucose', 'CGMDashboard', 'Sleep'] },
  { name: 'Plans', icon: CalendarCheck, page: 'Meals', pages: ['Meals', 'Exercise', 'Medications'] },
  { name: 'Insights', icon: Sparkles, page: 'Home', hash: '#insights', pages: [] },
  { name: 'Profile', icon: User, page: 'Profile', pages: ['Profile', 'AdminUsers'] },
];

const PILLS = {
  Log: [
    { label: 'Glucose', page: 'Glucose' },
    { label: 'CGM', page: 'CGMDashboard' },
    { label: 'Sleep', page: 'Sleep' },
  ],
  Plans: [
    { label: 'Meals', page: 'Meals' },
    { label: 'Exercise', page: 'Exercise' },
    { label: 'Meds', page: 'Medications' },
  ],
};

export default function Layout({ children }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await api.auth.me();
        setCurrentUser(user);
      } catch (error) {
        // User not authenticated
      }
    };
    loadUser();
  }, []);

  const isPage = (page) => currentPath === createPageUrl(page) || currentPath.includes(page);
  const isInsights = location.hash === '#insights';
  const active = SECTIONS.find((s) =>
    s.name === 'Insights' ? isInsights && isPage('Home')
      : s.name === 'Today' ? isPage('Home') && !isInsights
      : s.pages.some(isPage)
  );

  const pills = [
    ...(PILLS[active?.name] || []),
    ...(active?.name === 'Profile' && currentUser?.role === 'admin' ? [{ label: 'Admin', page: 'AdminUsers' }] : []),
  ];
  const profilePills = active?.name === 'Profile' && pills.length === 1 ? [{ label: 'Profile', page: 'Profile' }, ...pills] : pills;

  const initials = (currentUser?.full_name || currentUser?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />

      {/* Frosted top bar */}
      <header className="glass-bar fixed top-0 inset-x-0 z-50 border-b">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 h-14">
          <Link
            to={createPageUrl('Profile')}
            aria-label="Profile"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center font-display font-bold text-sm"
          >
            {initials}
          </Link>
          <span className="text-sm font-medium text-slate-600">{moment().format('ddd, D MMM')}</span>
          <Link
            to={createPageUrl('Home')}
            aria-label="Reminders"
            className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center text-slate-600 hover:text-emerald-600 transition-colors"
          >
            <Bell className="w-5 h-5" />
          </Link>
        </div>
        {profilePills.length > 0 && (
          <div className="max-w-3xl mx-auto flex gap-2 px-4 pb-2 overflow-x-auto">
            {profilePills.map((p) => (
              <Link
                key={p.page}
                to={createPageUrl(p.page)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                  isPage(p.page) ? "bg-emerald-500 text-white" : "bg-white/70 text-slate-600 hover:text-emerald-600"
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className={cn("pb-24", profilePills.length > 0 ? "pt-28" : "pt-16")}>
        {children}
      </main>

      {/* Frosted bottom tab bar */}
      <nav className="glass-bar fixed bottom-0 inset-x-0 z-50 border-t" aria-label="Main">
        <div className="max-w-3xl mx-auto flex items-center justify-around py-2">
          {SECTIONS.map((item) => {
            const isActive = active?.name === item.name;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.page) + (item.hash || '')}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex flex-col items-center py-1.5 px-3 rounded-2xl transition-colors",
                  isActive ? "text-emerald-600 bg-emerald-50/80" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "stroke-[2.5px]")} />
                <span className="text-[11px] mt-0.5 font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
