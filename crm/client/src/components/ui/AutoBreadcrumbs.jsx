import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../../layouts/navigation.js';
import { PageBreadcrumbs } from './PageHeader.jsx';

const MAIN = 'main';
const WORDS = { new: 'actions.create', edit: 'actions.edit' };

// Breadcrumbs for every page below a section, worked out from the address:
//   /companies/<id>       Dashboard / Companies / <the page's own title>
//   /companies/<id>/edit  Dashboard / Companies / <title> ... / Edit
// The section comes from the navigation (so it is named in the user's
// language); the last step is whatever the page calls itself in its <h1>,
// read once it has loaded. Section pages themselves (/companies) have none.
export default function AutoBreadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [title, setTitle] = useState('');

  const segments = pathname.split('/').filter(Boolean);
  // The longest navigation entry this address is under.
  // A page that is itself in the navigation is a section, not something below one.
  const isSection = NAV_ITEMS.some((item) => item.to === pathname);
  const section = isSection ? undefined : NAV_ITEMS.filter((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const last = segments.at(-1);

  useEffect(() => {
    setTitle('');
    if (!section) return undefined;
    // The heading appears when the record has loaded; look until it does.
    const read = () => setTitle(document.querySelector(`${MAIN} h1`)?.textContent?.trim() ?? '');
    read();
    const observer = new MutationObserver(read);
    const main = document.querySelector(MAIN);
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, section]);

  if (!section) return null;
  const items = [{ label: t(section.labelKey), to: section.to }];
  if (WORDS[last]) {
    // Editing a record: its page is one step up.
    if (last === 'edit' && segments.length >= 3) items.push({ label: title || '…', to: `/${segments.slice(0, -1).join('/')}` });
    items.push({ label: t(WORDS[last]) });
  } else {
    items.push({ label: title || '…' });
  }
  return <PageBreadcrumbs items={items} />;
}
