package co.finatrix.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;

/**
 * "Share to FinatriX" on Android.
 *
 * MainActivity's SEND / SEND_MULTIPLE intent filter brings shared images here.
 * Each one is copied out of the sharing app's content URI into this app's own
 * cache (the grant to read the URI does not outlive the intent), and the page
 * (src/native/shareIntake.ts) takes the copies, reads them, deletes them and
 * opens the screenshot import's review. Nothing is uploaded, and nothing is
 * saved to the ledger until the user presses Import.
 *
 * The iOS half, with the same JS name and methods, is ios/App/App/FxSharePlugin.swift.
 */
@CapacitorPlugin(name = "FxShare")
public class SharePlugin extends Plugin {
    /** The page's import reads at most this many at once. */
    static final int MAX_FILES = 10;
    /** The import refuses anything larger, so it is not copied. */
    static final long MAX_BYTES = 15L * 1024 * 1024;

    private final List<JSObject> pending = new ArrayList<>();
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private File folder() {
        return new File(getContext().getCacheDir(), "fx-share");
    }

    @Override
    public void load() {
        receive(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        receive(intent);
    }

    /** Copy the images an intent carries, then tell the page. Ignores every other intent. */
    private void receive(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        List<Uri> uris = streams(intent, action);
        String intentType = type;
        // Consumed: a recreated activity (or the next plugin load) must not
        // import the same share again from the intent it still holds.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        if (uris.isEmpty()) return;

        io.execute(() -> {
            List<JSObject> copied = new ArrayList<>();
            for (Uri uri : uris) {
                if (copied.size() >= MAX_FILES) break;
                JSObject file = copy(uri, intentType);
                if (file != null) copied.add(file);
            }
            if (copied.isEmpty()) return;
            synchronized (pending) {
                // A new share replaces one the page never took.
                pending.clear();
                pending.addAll(copied);
            }
            notifyListeners("received", new JSObject(), true);
        });
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent, String action) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else {
            ArrayList<Uri> list = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        return uris;
    }

    /**
     * One shared image into the cache, or null. Only content: URIs, which the
     * sender granted. The type is read from the file's own first bytes: many
     * providers (MediaStore among them, for an app without media permission)
     * answer getType with null, and a sender's label is only a hint.
     */
    private JSObject copy(Uri uri, String intentType) {
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) return null;
        ContentResolver resolver = getContext().getContentResolver();

        File dir = folder();
        if (!dir.isDirectory() && !dir.mkdirs()) return null;
        File target = new File(dir, UUID.randomUUID().toString());
        byte[] head = new byte[12];
        int headLength = 0;
        long written = 0;
        try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(target)) {
            if (in == null) throw new IOException("No stream");
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) {
                if (headLength < head.length) {
                    int take = Math.min(n, head.length - headLength);
                    System.arraycopy(buffer, 0, head, headLength, take);
                    headLength += take;
                }
                written += n;
                if (written > MAX_BYTES) throw new IOException("Too large");
                out.write(buffer, 0, n);
            }
        } catch (IOException | SecurityException e) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            return null;
        }

        String type = sniff(head, headLength);
        if (type == null) type = imageType(safeType(resolver, uri));
        if (type == null) type = imageType(intentType);
        if (written == 0 || type == null) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            return null;
        }
        File named = new File(dir, target.getName() + extension(type));
        if (!target.renameTo(named)) named = target;

        JSObject file = new JSObject();
        file.put("path", named.getAbsolutePath());
        file.put("name", displayName(resolver, uri));
        file.put("type", type);
        return file;
    }

    /** PNG, JPEG, GIF or WebP from the first bytes, or null. */
    static String sniff(byte[] h, int n) {
        if (n >= 8 && (h[0] & 0xff) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "image/png";
        if (n >= 3 && (h[0] & 0xff) == 0xff && (h[1] & 0xff) == 0xd8 && (h[2] & 0xff) == 0xff) return "image/jpeg";
        if (n >= 4 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return "image/gif";
        if (n >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
            && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return "image/webp";
        return null;
    }

    /** A specific image type, or null for anything else (including the wildcard image/*). */
    private static String imageType(String type) {
        return type != null && type.startsWith("image/") && !type.equals("image/*") ? type : null;
    }

    private static String safeType(ContentResolver resolver, Uri uri) {
        try {
            return resolver.getType(uri);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String extension(String type) {
        switch (type) {
            case "image/png": return ".png";
            case "image/webp": return ".webp";
            case "image/gif": return ".gif";
            default: return ".jpg";
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (RuntimeException ignored) {
            // Some providers refuse the query; the page names it instead.
        }
        return "";
    }

    @PluginMethod
    public void takePending(PluginCall call) {
        JSArray files = new JSArray();
        synchronized (pending) {
            for (JSObject file : pending) files.put(file);
            pending.clear();
        }
        JSObject result = new JSObject();
        result.put("files", files);
        call.resolve(result);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        String root;
        try {
            root = folder().getCanonicalPath() + File.separator;
        } catch (IOException e) {
            call.resolve();
            return;
        }
        for (int i = 0; i < paths.length(); i++) {
            try {
                File file = new File(paths.getString(i));
                // Only the copies this plugin made.
                if (file.getCanonicalPath().startsWith(root)) {
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            } catch (JSONException | IOException ignored) {
                // Skip a malformed path.
            }
        }
        call.resolve();
    }
}
