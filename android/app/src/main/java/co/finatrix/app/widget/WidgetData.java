package co.finatrix.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reads the document the app writes for the widgets (src/tools/lib/widgetData.ts,
 * docs/WIDGETS.md) and decides what to print. No maths here: the app has already
 * worked out each day's figure, and this only picks the entry for today.
 */
public final class WidgetData {

    /** SharedPreferences file and key the app writes through WidgetPlugin. */
    public static final String PREFS = "fx_widget";
    public static final String KEY = "payload";
    /** The payload version this reader understands. */
    static final int VERSION = 1;

    public enum Kind { AMOUNT, HIDDEN, NO_BUDGET, OPEN_APP }

    public final Kind kind;
    /** The amount as the app formats it, or the mask. Null for the two prompts. */
    public final String amount;

    private WidgetData(Kind kind, String amount) {
        this.kind = kind;
        this.amount = amount;
    }

    static void save(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).commit();
    }

    public static WidgetData read(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return parse(prefs.getString(KEY, null), new Date());
    }

    static WidgetData parse(String json, Date now) {
        if (json == null) return new WidgetData(Kind.OPEN_APP, null);
        try {
            JSONObject p = new JSONObject(json);
            if (p.optInt("v", 0) != VERSION) return new WidgetData(Kind.OPEN_APP, null);
            if (p.optBoolean("noBudget", false)) return new WidgetData(Kind.NO_BUDGET, null);
            if (p.optBoolean("hidden", false)) return new WidgetData(Kind.HIDDEN, p.optString("mask", "••••"));
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now);
            JSONArray days = p.optJSONArray("days");
            if (days != null) {
                for (int i = 0; i < days.length(); i++) {
                    JSONObject d = days.optJSONObject(i);
                    if (d != null && today.equals(d.optString("date"))) {
                        return new WidgetData(Kind.AMOUNT, d.optString("text"));
                    }
                }
            }
        } catch (Exception ignored) {
            // A damaged document reads as "open the app", which rewrites it.
        }
        return new WidgetData(Kind.OPEN_APP, null);
    }
}
