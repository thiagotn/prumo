'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { moduleFromPath } from '@/lib/modules';
import type { NavSection } from '@/lib/navigation';
import styles from './shell.module.css';

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const current = moduleFromPath(pathname);

  return (
    <nav className={`${styles.navList} scrollbar`} aria-label="Módulos">
      {sections.map((section) => (
        <div className={styles.navGroup} key={section.group}>
          <div className={styles.navGroupTitle}>{section.group}</div>
          {section.items.map((item) => {
            const active = item.module === current;
            return (
              <Link
                key={item.module}
                href={item.path}
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
