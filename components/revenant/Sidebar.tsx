'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface SidebarProps {
  user?: {
    name?: string;
    email?: string;
    image?: string;
  };
  hasAccess?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function LayoutDashboardIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function FileXIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
      <line x1="9" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="15" y2="12" />
    </svg>
  );
}

function UsersIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShieldCheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function MailIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  );
}

const navItems: NavItem[] = [
  {
    href: '/trial-guard',
    label: 'Trial Guard',
    icon: null,
  },
  {
    href: '/overview',
    label: 'Overview',
    icon: null,
  },
];

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const color = active ? '#6C63FF' : '#4B5563';
  if (href === '/trial-guard') return <ShieldCheckIcon color={color} />;
  if (href === '/overview') return <LayoutDashboardIcon color={color} />;
  if (href === '/settings') return <SettingsIcon color={color} />;
  return null;
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

export default function Sidebar({ user, hasAccess = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col h-screen bg-white flex-shrink-0"
      style={{
        width: '240px',
        borderRight: '1px solid #E5E7EB',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <ZapIcon />
        <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-1 px-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 h-10 px-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: isActive ? '#EDE9FE' : 'transparent',
                color: isActive ? '#6C63FF' : '#4B5563',
                borderLeft: isActive ? '2px solid #6C63FF' : '2px solid transparent',
              }}
            >
              <NavIcon href={item.href} active={isActive} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Divider */}
        <div className="my-1 border-t border-[#E5E7EB]" />

        {/* Settings */}
        {(() => {
          const isActive = pathname === '/settings' || pathname.startsWith('/settings/');
          return (
            <Link
              href="/settings"
              className="flex items-center gap-2.5 h-10 px-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: isActive ? '#EDE9FE' : 'transparent',
                color: isActive ? '#6C63FF' : '#4B5563',
                borderLeft: isActive ? '2px solid #6C63FF' : '2px solid transparent',
              }}
            >
              <NavIcon href="/settings" active={isActive} />
              <span className="font-medium">Settings</span>
            </Link>
          );
        })()}

        {/* Upgrade card */}
        {!hasAccess && (
          <div
            className="mt-4 rounded-lg p-3 flex flex-col gap-2"
            style={{ backgroundColor: '#EDE9FE' }}
          >
            <span className="text-xs font-semibold text-[#6D28D9]">
              Upgrade to activate recovery
            </span>
            <button
              className="text-xs font-medium text-white py-1.5 px-3 rounded"
              style={{ backgroundColor: '#6C63FF' }}
            >
              Activate REVENANT
            </button>
          </div>
        )}
      </nav>

      {/* User row */}
      <div className="flex items-center gap-2.5 px-3 py-4 border-t border-[#E5E7EB]">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold text-[#4B5563]"
          style={{ width: '28px', height: '28px', backgroundColor: '#E5E7EB' }}
        >
          {getInitials(user?.name, user?.email)}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          {user?.name && (
            <span className="text-[12px] font-medium text-[#1A1A1A] truncate">{user.name}</span>
          )}
          {user?.email && (
            <span className="text-[11px] text-[#9CA3AF] truncate">{user.email}</span>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          title="Se déconnecter"
          className="flex-shrink-0 flex items-center justify-center rounded-md transition-colors group"
          style={{ width: '28px', height: '28px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FEE2E2')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="group-hover:stroke-red-500 transition-colors"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
