import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * What the Android app lets leave the device: backups and FileProvider grants.
 * Read from the real resource files so a regenerated `android/` (`npx cap add`)
 * that restores the template's broad defaults fails here.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('Android data exposure', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');

  it('keeps the session out of cloud backup on every supported Android version', () => {
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    const modern = read('android/app/src/main/res/xml/data_extraction_rules.xml');
    const cloud = modern.match(/<cloud-backup>([\s\S]*?)<\/cloud-backup>/)?.[1] ?? '';
    expect(cloud).toMatch(/<exclude domain="root" path="app_webview\/"\s*\/>/);
    // Phone-to-phone transfer stays whole (guest data moves with the person).
    expect(modern.replace(/<!--[\s\S]*?-->/g, '')).not.toContain('<device-transfer');
    const legacy = read('android/app/src/main/res/xml/backup_rules.xml');
    expect(legacy).toMatch(/<exclude domain="root" path="app_webview\/"\s*\/>/);
  });

  it('lets the FileProvider share only the camera-capture directory', () => {
    const paths = read('android/app/src/main/res/xml/file_paths.xml').replace(/<!--[\s\S]*?-->/g, '');
    const entries = [...paths.matchAll(/<([a-z-]+-path)\b[^>]*\/>/g)].map((m) => m[0]);
    expect(entries).toEqual(['<external-files-path name="captured_images" path="Pictures/" />']);
  });
});
