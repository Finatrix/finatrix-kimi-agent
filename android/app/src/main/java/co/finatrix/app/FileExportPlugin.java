package co.finatrix.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Writes only to a destination the user chooses; no storage permission is needed. */
@CapacitorPlugin(name = "FxFileExport")
public class FileExportPlugin extends Plugin {
    private final AtomicBoolean exportPending = new AtomicBoolean(false);
    private byte[] pendingData;

    @PluginMethod
    public void saveFile(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename", "finatrix-export");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (data == null || filename.isEmpty() || filename.contains("/") || filename.contains("\\")) {
            call.reject("Invalid export file.");
            return;
        }
        if (!exportPending.compareAndSet(false, true)) {
            call.reject("Finish the current export before starting another.");
            return;
        }
        try {
            pendingData = Base64.decode(data, Base64.DEFAULT);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            startActivityForResult(call, intent, "saveFileResult");
        } catch (Exception error) {
            pendingData = null;
            exportPending.set(false);
            call.reject("Could not open the file picker.");
        }
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        final byte[] bytes = pendingData;
        pendingData = null;
        if (call == null) {
            exportPending.set(false);
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            exportPending.set(false);
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        // Providers can write to local storage or a cloud drive. Keep that I/O
        // off the main thread so a slow provider never freezes the app.
        execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                if (stream == null || bytes == null) throw new IOException("No output stream");
                stream.write(bytes);
                stream.flush();
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) {
                call.reject("Could not save the file. Please choose another location and try again.");
            } finally {
                exportPending.set(false);
            }
        });
    }
}
