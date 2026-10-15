import * as LA from 'expo-local-authentication';

export async function biometricCapability() {
  const [hw, enrolled, level] = await Promise.all([LA.hasHardwareAsync(), LA.isEnrolledAsync(), LA.getEnrolledLevelAsync()]);
  return { available: hw && enrolled && level >= LA.SecurityLevel.BIOMETRIC_STRONG };
}

export async function promptBiometric(promptMessage: string): Promise<boolean> {
  const r = await LA.authenticateAsync({
    promptMessage,
    cancelLabel: 'Usar PIN',
    disableDeviceFallback: true, // o fallback é o PIN do app, não o do aparelho
    biometricsSecurityLevel: 'strong',
  });
  return r.success;
}
