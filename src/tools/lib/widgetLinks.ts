/**
 * Where the home-screen widgets' links land (native/bridge.ts maps
 * `co.finatrix.app://widget/add` and `/open` onto these). Kept apart from
 * widgetData.ts so the bridge does not pull the expense maths into its chunk.
 */

/** Query parameter on the Expenses page that opens the add-expense form. */
export const NEW_EXPENSE_PARAM = 'new';
/** Where the widget's Add lands. */
export const WIDGET_ADD_PATH = `/tools/expenses?${NEW_EXPENSE_PARAM}=1`;
/** Where a tap on the figure lands. */
export const WIDGET_OPEN_PATH = '/tools/expenses';
