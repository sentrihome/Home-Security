import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { useSetupWizard } from '@/context/SetupWizardContext';
import { piApi } from '@/lib/api';
import { DRIVE_FOLDER_NAME, listDriveClips, type DriveClip } from '@/lib/driveClips';

type ClipRow = {
  key: string;
  name: string;
  createdLabel: string;
  source: 'drive' | 'pi';
  playUrl?: string;
  thumbnail?: string;
  size?: number;
};

function formatBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClipsScreen() {
  const { isLoggedIn } = useAuth();
  const { piBaseUrl } = useSetupWizard();
  const [items, setItems] = useState<ClipRow[]>([]);
  const [message, setMessage] = useState('Pull to refresh or tap Load.');
  const [loading, setLoading] = useState(false);

  const loadClips = useCallback(async () => {
    setLoading(true);
    const rows: ClipRow[] = [];
    const notes: string[] = [];

    if (isLoggedIn) {
      try {
        const drive = await listDriveClips();
        for (const c of drive) {
          rows.push(driveToRow(c));
        }
        notes.push(`Drive ${DRIVE_FOLDER_NAME}: ${drive.length}`);
      } catch (error) {
        notes.push(
          `Drive: ${error instanceof Error ? error.message : 'list failed'}`
        );
      }
    } else {
      notes.push('Sign in with Google to list Drive clips (works off Wi-Fi).');
    }

    try {
      const cache = await piApi.clipsCache(piBaseUrl);
      const local = Array.isArray(cache.clips) ? cache.clips : [];
      const driveNames = new Set(rows.map((r) => r.name));
      let added = 0;
      for (const c of local) {
        if (driveNames.has(c.name)) continue;
        rows.push({
          key: `pi:${c.name}`,
          name: c.name,
          createdLabel: c.mtime
            ? new Date(c.mtime * 1000).toLocaleString()
            : 'On Pi (not uploaded yet)',
          source: 'pi',
          playUrl: piApi.clipFileUrl(c.name, piBaseUrl),
          size: c.size,
        });
        added += 1;
      }
      notes.push(`Pi cache: ${local.length} (${added} not in Drive)`);
    } catch {
      notes.push('Pi cache unreachable (need home Wi-Fi for un-uploaded clips).');
    }

    rows.sort((a, b) => b.createdLabel.localeCompare(a.createdLabel));
    setItems(rows);
    setMessage(notes.join(' · '));
    setLoading(false);
  }, [isLoggedIn, piBaseUrl]);

  useFocusEffect(
    useCallback(() => {
      void loadClips();
    }, [loadClips])
  );

  async function openClip(row: ClipRow) {
    if (!row.playUrl) return;
    try {
      if (row.source === 'drive') {
        await WebBrowser.openBrowserAsync(row.playUrl);
        return;
      }
      const supported = await Linking.canOpenURL(row.playUrl);
      if (supported) {
        await Linking.openURL(row.playUrl);
      } else {
        await WebBrowser.openBrowserAsync(row.playUrl);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not open clip');
    }
  }

  return (
    <Screen
      title="Saved clips"
      subtitle={`Drive folder ${DRIVE_FOLDER_NAME}. Pi cache shows clips that have not uploaded yet.`}
      scroll={false}>
      {!isLoggedIn ? (
        <View style={styles.card}>
          <Text>Sign in with Google to list SentriHome clips from Drive.</Text>
          <Link href="/login" asChild>
            <PrimaryButton label="Sign in" />
          </Link>
        </View>
      ) : null}
      <PrimaryButton label="Load clips" loading={loading} onPress={loadClips} />
      <Text style={styles.message}>{message}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Loading…' : 'No clips yet. Trigger motion or POST /motion after Drive is linked.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openClip(item)}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbLabel}>{item.source === 'drive' ? 'D' : 'Pi'}</Text>
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {item.source === 'drive' ? 'Google Drive' : 'On Pi (not in Drive yet)'}
                {item.size ? ` · ${formatBytes(item.size)}` : ''}
              </Text>
              <Text style={styles.rowMeta}>{item.createdLabel}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

function driveToRow(c: DriveClip): ClipRow {
  return {
    key: `drive:${c.id}`,
    name: c.name,
    createdLabel: c.createdTime ? new Date(c.createdTime).toLocaleString() : 'Drive',
    source: 'drive',
    playUrl: c.webViewLink,
    thumbnail: c.thumbnailLink,
    size: c.size,
  };
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  message: {
    fontSize: 13,
    opacity: 0.7,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  empty: {
    opacity: 0.5,
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  thumb: {
    width: 72,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.6,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    opacity: 0.6,
  },
});
