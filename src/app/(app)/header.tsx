'use client';

import { usePathname } from 'next/navigation';
import { MODULE_DEFS, moduleFromPath } from '@/lib/modules';
import styles from './shell.module.css';

/** Content header: the group kicker plus the module title, derived from the route. */
export function Header({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();
  const activeModule = moduleFromPath(pathname);
  const def = activeModule ? MODULE_DEFS[activeModule] : null;

  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <div className="kicker">{def?.crumb ?? clinicName}</div>
        <h1 className={styles.headerTitle}>{def?.title ?? clinicName}</h1>
      </div>
    </header>
  );
}
