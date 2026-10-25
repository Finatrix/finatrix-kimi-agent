/**
 * The one page pattern every Careers area follows: a header with a title, a
 * plain sentence and at most one primary action; optional tabs for the area's
 * sub-views (kept in `?tab=`); then the content of the selected view.
 */
import { useId, type ReactNode } from 'react';
import { PageHeader, TabPanel, Tabs, type TabItem } from '../ui/primitives';
import { useAreaTab } from '../ui/useAreaTab';

export function Area<K extends string>({
  title,
  description,
  actions,
  tabs,
  tabsLabel,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode | ((active: K) => ReactNode);
  tabs: readonly TabItem<K>[];
  tabsLabel?: string;
  children: (active: K) => ReactNode;
}) {
  const keys = tabs.map((t) => t.key);
  const [active, select] = useAreaTab<K>(keys);
  const idBase = useId();
  return (
    <div className="cx-area">
      <PageHeader title={title} description={description} actions={typeof actions === 'function' ? actions(active) : actions} />
      {tabs.length > 1 ? (
        <>
          <Tabs items={tabs} active={active} onChange={select} label={tabsLabel ?? `${title} views`} idBase={idBase} />
          <TabPanel idBase={idBase} active={active}>
            {children(active)}
          </TabPanel>
        </>
      ) : (
        children(active)
      )}
    </div>
  );
}
