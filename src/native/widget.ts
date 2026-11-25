import { registerPlugin } from '@capacitor/core';
import type { WidgetPayload } from '../tools/lib/widgetData';

/**
 * The web side of the in-repo `FxWidget` plugin:
 *   ios/App/App/FxWidgetPlugin.swift
 *   android/app/src/main/java/co/finatrix/app/widget/WidgetPlugin.java
 *
 * One call: store the payload where the widgets read it and ask the system to
 * redraw them. The document's shape and storage keys are in
 * tools/lib/widgetData.ts and docs/WIDGETS.md. Loaded only inside the apps.
 */
interface FxWidgetPlugin {
  publish(options: { payload: string }): Promise<void>;
}

const FxWidget = registerPlugin<FxWidgetPlugin>('FxWidget');

/** Never throws: a widget that missed one update catches the next. */
export async function publishWidget(payload: WidgetPayload): Promise<void> {
  try {
    await FxWidget.publish({ payload: JSON.stringify(payload) });
  } catch {
    /* An app build without the plugin, or storage refused: nothing to show. */
  }
}
