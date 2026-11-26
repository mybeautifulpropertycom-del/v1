import Link from "next/link";
import { guideArticlePath, guideArticles } from "./articles";
import { viewingGuide } from "./vizionare-apartament-bloc-vechi/guide";
import styles from "./vizionare-apartament-bloc-vechi/guide.module.css";

const guides = [
  viewingGuide,
  ...guideArticles.map(({ slug, title }) => ({
    path: guideArticlePath(slug),
    title,
  })),
];

export function GuideLinks({ currentPath }: { currentPath: string }) {
  return (
    <nav className={styles.contents} aria-label="Alte ghiduri">
      <h2>Alte ghiduri</h2>
      <ul>
        {guides
          .filter(({ path }) => path !== currentPath)
          .map(({ path, title }) => (
            <li key={path}>
              <Link href={path}>{title}</Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
