import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { ChatScreen } from './src/components/Chat/ChatScreen';
import { theme } from './src/theme';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ChatScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
