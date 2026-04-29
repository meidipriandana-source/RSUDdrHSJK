import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

// Handle potential nested default from JSON import (Vite can sometimes nest it)
const rawConfig: any = firebaseConfig;
const firebaseOptions = rawConfig.default || rawConfig;

console.log('Firebase initialization starting...');
console.log('Project ID:', firebaseOptions.projectId);

if (!firebaseOptions || !firebaseOptions.apiKey) {
  console.error('CRITICAL: Firebase config is invalid or missing apiKey!', {
    hasOptions: !!firebaseOptions,
    keys: firebaseOptions ? Object.keys(firebaseOptions) : []
  });
} else {
  console.log('API Key present, starts with:', firebaseOptions.apiKey.substring(0, 4) + '...');
}

const app = initializeApp(firebaseOptions);
export const db = getFirestore(app, firebaseOptions.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

// --- Connection Test ---
async function testConnection() {
  try {
    console.log('Firebase: Testing connection...');
    await getDocFromServer(doc(db, 'system', 'connection-test'));
    console.log('Firebase: Connection test finished (ready).');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('offline')) {
      console.error("Firebase: Offline error. This usually indicates an invalid API Key or project mismatch.");
    } else if (msg.toLowerCase().includes('permission-denied') || msg.toLowerCase().includes('permission denied')) {
      console.log('Firebase: Connection verified (received expected permission denied).');
    } else {
      console.warn("Firebase: Connection test returned:", msg);
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errorJson = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorJson);
  throw new Error(errorJson);
}
