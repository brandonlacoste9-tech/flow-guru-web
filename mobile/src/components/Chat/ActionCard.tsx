import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Calendar, CloudSun, MapPin, Newspaper } from 'lucide-react-native';

interface ActionCardProps {
  action: string;
  status: string;
  title: string;
  summary: string;
  data?: any;
}

export const ActionCard: React.FC<ActionCardProps> = ({ action, title, summary, data }) => {
  const renderIcon = () => {
    switch (action) {
      case 'weather.get': return <CloudSun color={theme.colors.accent} size={28} />;
      case 'calendar.list_events':
      case 'calendar.create_event': return <Calendar color={theme.colors.accent} size={28} />;
      case 'route.get': return <MapPin color={theme.colors.accent} size={28} />;
      case 'news.get': return <Newspaper color={theme.colors.accent} size={28} />;
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
});
