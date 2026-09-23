'use client';

import { usePathname } from 'next/navigation';
import { MODULE_DEFS, moduleFromPath } from '@/lib/modules';
import styles from './shell.module.css';

/** Short title for the compact mobile header. */
export function MobileTitle() {
  const pathname = usePathname();
  const activeModule = moduleFromPath(pathname);
  return (
    <div className={styles.mobileTitle}>
      {activeModule ? MODULE_DEFS[activeModule].label : 'Prumo'}
    </div>
  );
}
