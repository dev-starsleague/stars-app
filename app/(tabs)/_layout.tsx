import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
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
          borderTopColor: Colors.navyLine + '40',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="classifiche" options={{
        title: 'Classifica',
        tabBarIcon: ({ color, size }) => <Ionicons name="trophy-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="stars" options={{
        title: 'Stars',
        tabBarIcon: ({ focused }) => (
          <View style={[styles.fab, focused && styles.fabActive]}>
            <Ionicons name="star" color={Colors.navyDeep} size={26} />
          </View>
        ),
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 18 },
      }} />
      <Tabs.Screen name="eventi" options={{
        title: 'Eventi',
        tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="profilo" options={{
        title: 'Profilo',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="prenota" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -24,
    borderWidth: 4, borderColor: Colors.navyDeep,
    boxShadow: '0 6px 18px rgba(255,175,0,0.45)',
  },
  fabActive: {
    boxShadow: '0 0 0 3px rgba(255,175,0,0.35), 0 6px 18px rgba(255,175,0,0.55)',
  },
});
