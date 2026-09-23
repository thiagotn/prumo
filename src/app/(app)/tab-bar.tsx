'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { moduleFromPath } from '@/lib/modules';
import type { NavItem } from '@/lib/navigation';
import { MODULE_ICONS } from './icons';
import styles from './shell.module.css';

/** Mobile tab bar — touch targets >= 44px (CLAUDE.md). */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const current = moduleFromPath(pathname);

  return (
    <nav className={styles.tabBar} aria-label="Navegação principal">
      {items.map((item) => {
        const Icon = MODULE_ICONS[item.module];
        const active = item.module === current;
        return (
          <Link
            key={item.module}
            href={item.path}
            className={`${styles.tabItem} ${active ? styles.tabItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={19} strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
