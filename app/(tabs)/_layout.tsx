import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { Colors } from '../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.slate,
        tabBarStyle: {
          backgroundColor: Colors.navyDeep,
          borderTopColor: Colors.navyLine + '55',
          height: Platform.OS === 'ios' ? 86 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="prenota" options={{ title: 'Prenota', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }} />
      <Tabs.Screen name="eventi" options={{ title: 'Eventi', tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} /> }} />
      <Tabs.Screen name="classifiche" options={{ title: 'Classifiche', tabBarIcon: ({ color, size }) => <Ionicons name="podium" color={color} size={size} /> }} />
      <Tabs.Screen name="profilo" options={{ title: 'Profilo', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
    </Tabs>
  );
}
