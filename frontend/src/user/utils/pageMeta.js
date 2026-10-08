import { useEffect } from 'react';
import { useAppSelector } from '../store';

/** Browser tab title and search-engine description for a page ("Hero bike | AppName"). */
export const usePageMeta = (title, description) => {
  const appName = useAppSelector((s) => s.app.bootstrap?.branding?.appName);
  useEffect(() => {
    if (!title) return undefined;
    const before = document.title;
    document.title = appName ? `${title} | ${appName}` : title;
    let tag = document.querySelector('meta[name="description"]');
    if (description) {
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('name', 'description');
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', description.slice(0, 160));
    }
    return () => {
      document.title = before;
    };
  }, [title, description, appName]);
};
