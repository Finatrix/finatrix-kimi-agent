package co.finatrix.app.widget;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * `FxWidget` (src/native/widget.ts): stores the app's widget document and
 * redraws the widgets. The iOS twin is ios/App/App/FxWidgetPlugin.swift.
 */
@CapacitorPlugin(name = "FxWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void publish(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("payload is required");
            return;
        }
        WidgetData.save(getContext(), payload);
        SafeSpendWidget.refreshAll(getContext());
        call.resolve();
    }
}
