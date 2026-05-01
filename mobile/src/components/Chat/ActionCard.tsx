import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { theme } from '../../theme';
import { Calendar, CloudSun, MapPin, Newspaper, Music } from 'lucide-react-native';

interface ActionCardProps {
  action: string;
  status: string;
  title: string;
  summary: string;
  data?: any;
}

export const ActionCard: React.FC<ActionCardProps> = ({ action, status, title, summary, data }) => {
  const renderIcon = () => {
    switch (action) {
      case 'weather.get': return <CloudSun color={theme.colors.accent} size={28} />;
      case 'calendar.list_events':
      case 'calendar.create_event': return <Calendar color={theme.colors.accent} size={28} />;
      case 'route.get': return <MapPin color={theme.colors.accent} size={28} />;
      case 'news.get': return <Newspaper color={theme.colors.accent} size={28} />;
      case 'music.play': return <Music color={theme.colors.accent} size={28} />;
      default: return null;
    }
  };

  const renderContent = () => {
    if (action === 'calendar.list_events' && data?.events) {
      return (
        <View style={styles.dataContainer}>
          {data.events.slice(0, 3).map((event: any, index: number) => (
            <View key={index} style={styles.eventItem}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventTime}>
                {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: 'full' === 'full' ? '2-digit' : '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    if (action === 'route.get' && status === 'executed') {
      const g = data?.mapsUrlGoogle as string | undefined;
      const a = data?.mapsUrlApple as string | undefined;
      if (g || a) {
        return (
          <View style={styles.linksRow}>
            {g ? (
              <TouchableOpacity onPress={() => Linking.openURL(g)} style={styles.linkBtn}>
                <Text style={styles.linkText}>Google Maps</Text>
              </TouchableOpacity>
            ) : null}
            {a ? (
              <TouchableOpacity onPress={() => Linking.openURL(a)} style={styles.linkBtnOutline}>
                <Text style={styles.linkTextOutline}>Apple Maps</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      }
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {renderIcon()}
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.summary}>{summary}</Text>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#333', // Subtle border
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    color: theme.colors.accent,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: theme.spacing.md,
  },
  summary: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: theme.spacing.md,
  },
  dataContainer: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: theme.spacing.md,
  },
  eventItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  eventTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: theme.spacing.md,
  },
  eventTime: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  linkBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
  },
  linkText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  linkBtnOutline: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
  },
  linkTextOutline: {
    color: theme.colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
});
