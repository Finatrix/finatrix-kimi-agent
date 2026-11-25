package co.finatrix.app.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import co.finatrix.app.MainActivity;
import co.finatrix.app.R;
import java.util.Calendar;

/**
 * The home-screen widget: today's safe-to-spend figure and an Add button.
 * Two sizes share this code (SafeSpendSmallWidget, SafeSpendMediumWidget) and
 * differ only in layout. Everything shown comes from WidgetData.
 *
 * Links go to MainActivity as `co.finatrix.app://widget/add` and `/open`, which
 * native/bridge.ts turns into the add-expense form and the Expenses page.
 */
public abstract class SafeSpendWidget extends AppWidgetProvider {

    static final String ADD_URL = "co.finatrix.app://widget/add";
    static final String OPEN_URL = "co.finatrix.app://widget/open";

    protected abstract int layout();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = render(context, layout(), WidgetData.read(context));
        for (int id : ids) manager.updateAppWidget(id, views);
        scheduleMidnight(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)) {
            refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    /** Redraw every placed FinatriX widget. Called after the app publishes. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<? extends SafeSpendWidget> cls : SIZES) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, cls));
            if (ids.length == 0) continue;
            int layout = cls == SafeSpendMediumWidget.class ? R.layout.widget_safe_spend_medium : R.layout.widget_safe_spend_small;
            RemoteViews views = render(context, layout, WidgetData.read(context));
            for (int id : ids) manager.updateAppWidget(id, views);
        }
        scheduleMidnight(context);
    }

    @SuppressWarnings("unchecked")
    private static final Class<? extends SafeSpendWidget>[] SIZES =
        new Class[] { SafeSpendSmallWidget.class, SafeSpendMediumWidget.class };

    static RemoteViews render(Context context, int layout, WidgetData data) {
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);
        switch (data.kind) {
            case AMOUNT:
                v.setTextViewText(R.id.fx_widget_amount, data.amount);
                v.setContentDescription(R.id.fx_widget_amount, data.amount);
                v.setViewVisibility(R.id.fx_widget_amount, View.VISIBLE);
                v.setViewVisibility(R.id.fx_widget_prompt, View.GONE);
                break;
            case HIDDEN:
                v.setTextViewText(R.id.fx_widget_amount, data.amount);
                v.setContentDescription(R.id.fx_widget_amount, context.getString(R.string.fx_widget_hidden_a11y));
                v.setViewVisibility(R.id.fx_widget_amount, View.VISIBLE);
                v.setViewVisibility(R.id.fx_widget_prompt, View.GONE);
                break;
            case NO_BUDGET:
                v.setTextViewText(R.id.fx_widget_prompt, context.getString(R.string.fx_widget_no_budget));
                v.setViewVisibility(R.id.fx_widget_amount, View.GONE);
                v.setViewVisibility(R.id.fx_widget_prompt, View.VISIBLE);
                break;
            default:
                v.setTextViewText(R.id.fx_widget_prompt, context.getString(R.string.fx_widget_open_app));
                v.setViewVisibility(R.id.fx_widget_amount, View.GONE);
                v.setViewVisibility(R.id.fx_widget_prompt, View.VISIBLE);
        }
        v.setOnClickPendingIntent(R.id.fx_widget_root, link(context, OPEN_URL, 1));
        v.setOnClickPendingIntent(R.id.fx_widget_add, link(context, ADD_URL, 2));
        return v;
    }

    private static PendingIntent link(Context context, String url, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * The figure is per day, so redraw just after local midnight. Inexact: a
     * minute or two late is fine, and an exact alarm needs a permission this
     * app has no reason to hold.
     */
    private static void scheduleMidnight(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 1);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        Intent tick = new Intent(context, SafeSpendSmallWidget.class).setAction(Intent.ACTION_DATE_CHANGED);
        PendingIntent pending = PendingIntent.getBroadcast(context, 0, tick,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.set(AlarmManager.RTC, next.getTimeInMillis(), pending);
    }
}
