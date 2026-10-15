import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go é um app genérico: não inclui SQLCipher nem os config plugins nativos deste projeto.
 * Nele o app roda em MODO DE TESTE (banco sem criptografia, aviso fixo na tela).
 * Em qualquer build próprio (dev build, preview, produção) a criptografia é obrigatória (fail-closed).
 */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Banco cifrado com SQLCipher? Falso apenas no Expo Go. */
export const DB_ENCRYPTED = !IS_EXPO_GO;
