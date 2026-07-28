import { useCallback, useState } from 'react';
import { FlatList, Image, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi } from '@/lib/api';
import type { EventClip } from '@/types';

export default function ClipsScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();
  const [events, setEvents] = useState<EventClip[]>([]);
  const [message, setMessage] = useState(
    isLoggedIn ? 'Tap load to fetch your clips.' : 'Sign in to view your clips.'
  );
  const [loading, setLoading] = useState(false);

  const loadClips = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const list = await cloudApi.events(session.token, cloudBaseUrl);
      setEvents(Array.isArray(list) ? list : []);
      setMessage(`Loaded ${Array.isArray(list) ? list.length : 0} events`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load clips');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [session, cloudBaseUrl]);

  return (
    <Screen
      title="Saved clips"
      subtitle="Events from the cloud backend (S3 / Drive)."
      scroll={false}>
      {!isLoggedIn ? (
        <View style={styles.card}>
          <Text>Sign in with Google Drive to view your clips.</Text>
          <Link href="/login" asChild>
            <PrimaryButton label="Sign in" />
          </Link>
        </View>
      ) : (
        <>
          <PrimaryButton label="Load clips" loading={loading} onPress={loadClips} />
          <Text style={styles.message}>{message}</Text>
          <FlatList
            data={events}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>No clips yet.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Image
                  source={{
                    uri: cloudApi.thumbnailUrl(item._id, session?.token, cloudBaseUrl),
                  }}
                  style={styles.thumb}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item._id}</Text>
                  <Text style={styles.rowMeta}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                  </Text>
                </View>
              </View>
            )}
          />
        </>
      )}
    </Screen>
  );
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
