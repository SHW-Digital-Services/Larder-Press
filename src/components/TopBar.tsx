import React from 'react';
import type { User } from '../lib/firebase';

export type ActiveView = 'converter' | 'cookbook' | 'shopping' | 'security';

interface TopBarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  savedCount: number;
  shoppingRemainingCount: number;
  user: User | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  savedCount,
  shoppingRemainingCount,
  user,
  onOpenAuth,
  onSignOut,
}) => {
  const navItems: { id: ActiveView; label: string; count?: number }[] = [
    { id: 'converter', label: 'Convert Video' },
    { id: 'cookbook', label: 'Saved Recipes', count: user ? savedCount : undefined },
    { id: 'shopping', label: 'Shopping List', count: user ? shoppingRemainingCount : undefined },
    { id: 'security', label: 'Account & MFA' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('converter')}
          className="font-editorial text-xl font-semibold tracking-tight text-stone-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D] rounded-sm"
        >
          Larder Press
        </button>

        {/* Zone 2: Single-line text navigation */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D] rounded-sm ${
                  isActive
                    ? 'text-stone-900 font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span className="ml-1.5 font-mono text-xs tabular-nums text-stone-500">
                    ({item.count})
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[19px] h-[2px] bg-[#14532D]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D]"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D]"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden border-t border-stone-200 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto text-xs font-medium"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`px-2.5 py-1.5 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {item.label}
              {typeof item.count === 'number' ? ` (${item.count})` : ''}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
