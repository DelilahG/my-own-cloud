import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { initials } from '../../lib/format';
import { MenuPopover, useMenu, type MenuEntry } from '../ui/Menu';
import { useToast } from '../ui/Toast';

const THEMES: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun size={15} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
  { value: 'system', label: 'System', icon: <Monitor size={15} /> },
];

export function AccountMenu() {
  const { user, logout } = useAuth();
  const { preference, setTheme } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();
  const menu = useMenu();
  if (!user) return null;

  const entries: MenuEntry[] = [
    { heading: 'Theme' },
    ...THEMES.map((t) => ({
      label: t.label,
      icon: preference === t.value ? <Check size={15} /> : t.icon,
      checked: preference === t.value,
      onSelect: () => setTheme(t.value),
    })),
    'separator',
    {
      label: 'Sign out',
      icon: <LogOut size={15} />,
      onSelect: async () => {
        await logout().catch(() => {});
        toast.info('You have been signed out.');
        navigate('/login', { replace: true });
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={`Account menu for ${user.displayName}`}
        onClick={(e) => menu.openFromButton(e.currentTarget)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-surface-2 sm:pr-3"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8a7ef9] to-[#4c3de0] text-xs font-semibold text-white">
          {initials(user.displayName)}
        </span>
        <span className="hidden max-w-36 truncate text-left text-[13px] leading-tight sm:block">
          <span className="block truncate font-medium text-fg">{user.displayName}</span>
          <span className="block truncate text-xs text-fg-subtle">{user.email}</span>
        </span>
      </button>
      {menu.anchor && (
        <MenuPopover anchor={menu.anchor} entries={entries} onClose={menu.close} label="Account" trigger={menu.trigger} />
      )}
    </>
  );
}
