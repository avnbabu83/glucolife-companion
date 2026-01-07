import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Home, 
  Utensils, 
  Activity, 
  Pill, 
  Dumbbell, 
  Moon,
  User
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

export default function Layout({ children }) {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { name: 'Home', icon: Home, path: createPageUrl('Home') },
    { name: 'CGM', icon: Activity, path: createPageUrl('CGMDashboard') },
    { name: 'Meals', icon: Utensils, path: createPageUrl('Meals') },
    { name: 'Meds', icon: Pill, path: createPageUrl('Medications') },
    { name: 'Exercise', icon: Dumbbell, path: createPageUrl('Exercise') },
    { name: 'Sleep', icon: Moon, path: createPageUrl('Sleep') },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-center" richColors />
      
      {/* Main Content */}
      <main className="pb-20 lg:pb-0 lg:pl-20">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 lg:hidden z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || 
              (item.path.includes(item.name) && currentPath.includes(item.name));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex flex-col items-center py-2 px-3 rounded-xl transition-all",
                  isActive 
                    ? "text-emerald-600" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5",
                  isActive && "stroke-[2.5px]"
                )} />
                <span className="text-[10px] mt-1 font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 bg-white border-r border-slate-200 hidden lg:flex flex-col items-center py-6 z-50">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.path || 
              (item.path.includes(item.name) && currentPath.includes(item.name));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex flex-col items-center py-3 px-4 rounded-xl transition-all w-full",
                  isActive 
                    ? "bg-emerald-50 text-emerald-600" 
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5",
                  isActive && "stroke-[2.5px]"
                )} />
                <span className="text-[10px] mt-1 font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>

        <Link
          to={createPageUrl('Profile')}
          className={cn(
            "flex flex-col items-center py-3 px-4 rounded-xl transition-all",
            currentPath.includes('Profile')
              ? "bg-emerald-50 text-emerald-600" 
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-1 font-medium">Profile</span>
        </Link>
      </nav>
    </div>
  );
}