import '@/i18n';
import '@/ui'; // registers window.CareBridgeUI on web
import React, { useEffect } from 'react';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { useFonts, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { RemindersBridge } from '@/features/RemindersBridge';
import { SessionProvider, useSession } from '@/state/SessionProvider';
import { colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

function Gate() {
  const { ready } = useSession();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  return (
    <>
      <RemindersBridge />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Fraunces_400Regular_Italic, IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
