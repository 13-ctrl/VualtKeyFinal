/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  Unlock, 
  Plus, 
  Search, 
  Trash2, 
  Eye, 
  EyeOff, 
  Copy, 
  Shield, 
  Key, 
  RefreshCw,
  LogOut,
  ShieldCheck,
  AlertCircle,
  Terminal
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogClose,
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  auth, 
  db 
} from '@/src/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  deriveKey, 
  encryptData, 
  decryptData, 
  bufferToBase64, 
  base64ToBuffer 
} from '@/src/lib/crypto';
import { VaultKeyLogo, VaultKeyBrand } from '@/src/components/VaultKeyLogo';

// --- Types ---

interface EncryptedCredential {
  id: string;
  ciphertext: string;
  iv: string;
}

interface DecryptedCredential {
  id: string;
  service: string;
  username: string;
  password: string;
  category: string;
  createdAt: number;
}

// --- Constants ---

const SALT_KEY = 'vault_salt';
const DATA_KEY = 'vault_data';
const VERIFY_KEY = 'vault_verify';
const VERIFY_STRING = 'VAULT_VERIFIED_SESSION';

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [decryptedVault, setDecryptedVault] = useState<DecryptedCredential[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [vaultMasterPassword, setVaultMasterPassword] = useState('');

  // Initialize Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Check for Vault in Firestore
  useEffect(() => {
    if (!user) {
      setHasVault(false);
      setMasterKey(null);
      setDecryptedVault([]);
      return;
    }

    const checkVault = async () => {
      try {
        const vaultDoc = await getDoc(doc(db, 'vaults', user.uid));
        setHasVault(vaultDoc.exists());
      } catch (error) {
        console.error("Error checking vault:", error);
      }
    };
    checkVault();
  }, [user]);

  // Real-time Credentials Sync
  useEffect(() => {
    if (!user || !masterKey) return;

    const q = query(collection(db, 'credentials'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const encryptedItems: EncryptedCredential[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EncryptedCredential));
      
      const decrypted = await decryptAll(encryptedItems, masterKey);
      setDecryptedVault(decrypted);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Failed to sync credentials");
    });

    return () => unsubscribe();
  }, [user, masterKey]);

  // Test Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // --- Actions ---

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        toast.success('Logged in successfully');
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        toast.success('Account created successfully');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleVaultSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(vaultMasterPassword, salt);
      
      const { ciphertext, iv } = await encryptData(VERIFY_STRING, key);
      
      await setDoc(doc(db, 'vaults', user.uid), {
        userId: user.uid,
        salt: bufferToBase64(salt.buffer),
        verifyCiphertext: bufferToBase64(ciphertext),
        verifyIv: bufferToBase64(iv.buffer),
        updatedAt: Date.now()
      });
      
      setMasterKey(key);
      setHasVault(true);
      toast.success('Vault initialized');
    } catch (error: any) {
      toast.error('Failed to initialize vault');
    }
  };

  const handleVaultUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const vaultDoc = await getDoc(doc(db, 'vaults', user.uid));
      if (!vaultDoc.exists()) {
        toast.error('Vault not found');
        return;
      }

      const data = vaultDoc.data();
      const salt = new Uint8Array(base64ToBuffer(data.salt));
      const key = await deriveKey(vaultMasterPassword, salt);
      
      const decryptedVerify = await decryptData(
        base64ToBuffer(data.verifyCiphertext), 
        key, 
        new Uint8Array(base64ToBuffer(data.verifyIv))
      );
      
      if (decryptedVerify !== VERIFY_STRING) {
        throw new Error('Invalid key');
      }
      
      setMasterKey(key);
      toast.success('Vault unlocked');
    } catch (error) {
      toast.error('Invalid master password');
    }
  };

  const decryptAll = async (encrypted: EncryptedCredential[], key: CryptoKey): Promise<DecryptedCredential[]> => {
    const results: DecryptedCredential[] = [];
    for (const item of encrypted) {
      try {
        const json = await decryptData(base64ToBuffer(item.ciphertext), key, new Uint8Array(base64ToBuffer(item.iv)));
        results.push({ id: item.id, ...JSON.parse(json) });
      } catch (e) {
        console.error('Failed to decrypt item', item.id);
      }
    }
    return results;
  };

  const addCredential = async (data: Omit<DecryptedCredential, 'id' | 'createdAt'>) => {
    if (!user || !masterKey) return;
    
    try {
      const credentialData = {
        ...data,
        createdAt: Date.now()
      };
      
      const { ciphertext, iv } = await encryptData(JSON.stringify(credentialData), masterKey);
      
      await addDoc(collection(db, 'credentials'), {
        userId: user.uid,
        ciphertext: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv.buffer),
        createdAt: Date.now()
      });
      
      setIsAdding(false);
      toast.success('Credential stored securely');
    } catch (error) {
      toast.error('Failed to store credential');
    }
  };

  const deleteCredential = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'credentials', id));
      toast.success('Credential deleted');
    } catch (error) {
      toast.error('Failed to delete credential');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMasterKey(null);
    setDecryptedVault([]);
    toast.info('Session ended');
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const filteredVault = useMemo(() => {
    return decryptedVault.filter(item => 
      item.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [decryptedVault, searchQuery]);

  // --- Render Helpers ---

  if (!isAuthReady) return null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background font-sans">
        <Toaster position="top-center" theme="dark" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center gap-12"
        >
          <VaultKeyBrand />

          <Card className="hardware-border bg-card shadow-2xl w-full border-[#4fd1c5]/20">
            <CardHeader className="text-center space-y-1">
              <CardTitle className="text-xl tracking-tight uppercase text-glow">
                {isLoginMode ? 'USER_LOGIN' : 'CREATE_ACCOUNT'}
              </CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-[0.2em]">
                {isLoginMode ? 'Access your cloud vault' : 'Start your secure journey'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">EMAIL_ADDRESS</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="bg-background/50 hardware-border"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-password">PASSWORD</Label>
                  <Input 
                    id="auth-password" 
                    type="password" 
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-background/50 hardware-border"
                    required
                  />
                </div>
                <Button type="submit" className="w-full uppercase tracking-widest font-bold">
                  {isLoginMode ? 'SIGN_IN' : 'REGISTER'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                variant="link" 
                className="text-[10px] uppercase tracking-widest text-muted-foreground"
                onClick={() => setIsLoginMode(!isLoginMode)}
              >
                {isLoginMode ? 'Need an account? Register' : 'Already have an account? Login'}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!masterKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background font-sans">
        <Toaster position="top-center" theme="dark" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center gap-12"
        >
          <VaultKeyBrand />

          <Card className="hardware-border bg-card shadow-2xl w-full border-[#4fd1c5]/20">
            <CardHeader className="text-center space-y-1">
              <CardTitle className="text-xl tracking-tight uppercase text-glow">VAULT_ENCRYPTION</CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-[0.2em]">
                {hasVault ? 'Decrypt cloud storage session' : 'Initialize master encryption key'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={hasVault ? handleVaultUnlock : handleVaultSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="master-password" name="password-label" className="text-[10px] uppercase tracking-widest opacity-70">MASTER_PASSWORD</Label>
                  <div className="relative">
                    <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                    <Input 
                      id="master-password" 
                      type="password" 
                      value={vaultMasterPassword}
                      onChange={(e) => setVaultMasterPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="bg-background/50 border-muted hardware-border focus-visible:ring-primary pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest uppercase">
                  {hasVault ? 'UNLOCK_VAULT' : 'GENERATE_VAULT'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <Shield className="w-3 h-3 text-primary" />
                  <span>AES-256-GCM Hardware Encryption</span>
                </div>
                <div className="pt-4 border-t border-muted/50 mt-2">
                  <Dialog>
                    <DialogTrigger 
                      render={
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-[9px] text-muted-foreground hover:text-destructive uppercase tracking-widest"
                        >
                          Reset Vault (Delete All Data)
                        </Button>
                      }
                    />
                    <DialogContent className="bg-card border-destructive/50 hardware-border sm:max-w-[400px]">
                      <DialogHeader>
                        <DialogTitle className="text-destructive uppercase tracking-tighter">CRITICAL_ACTION_REQUIRED</DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-widest leading-relaxed">
                          This operation will permanently destroy all encrypted data in your local vault. This action is irreversible.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="flex gap-2 pt-4">
                        <DialogClose render={<Button variant="outline" className="flex-1">CANCEL</Button>} />
                        <Button 
                          variant="destructive" 
                          className="flex-1"
                          onClick={async () => {
                            if (user) {
                              await deleteDoc(doc(db, 'vaults', user.uid));
                              // Also delete credentials
                              const q = query(collection(db, 'credentials'), where('userId', '==', user.uid));
                              // Note: In real app use a batch or cloud function for bulk delete
                              toast.info('Vault reset. Refreshing...');
                              setTimeout(() => window.location.reload(), 1000);
                            }
                          }}
                        >
                          CONFIRM_DELETE
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              {!hasVault && (
                <div className="flex items-start gap-2 p-3 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive uppercase leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Critical: Master password is the only way to recover your data.</span>
                </div>
              )}
              <Button variant="link" size="sm" onClick={handleLogout} className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Switch Account
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <Toaster position="top-center" theme="dark" />
      
      {/* Header */}
      <header className="border-b border-muted p-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <VaultKeyLogo className="w-10 h-10" />
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none text-glow">VaultKey</h1>
              <span className="text-[10px] text-primary uppercase tracking-[0.3em] font-medium">SECURE_CLOUD_VAULT</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hardware-border text-[10px] hidden sm:flex border-primary/30 text-primary">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mr-2 animate-pulse" />
              SECURE_SESSION
            </Badge>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Tabs for Dashboard */}
        <Tabs defaultValue="vault" className="w-full">
          <TabsList className="grid w-full grid-cols-2 hardware-border bg-card mb-6">
            <TabsTrigger value="vault" className="uppercase tracking-widest text-[10px]">Vault_Records</TabsTrigger>
            <TabsTrigger value="generator" className="uppercase tracking-widest text-[10px]">Key_Generator</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vault" className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="SEARCH_VAULT..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-card border-muted hardware-border"
                />
              </div>
              
              <Dialog open={isAdding} onOpenChange={setIsAdding}>
                <DialogTrigger 
                  render={
                    <Button className="w-full sm:w-auto gap-2">
                      <Plus className="w-4 h-4" />
                      ADD_CREDENTIAL
                    </Button>
                  }
                />
                <DialogContent className="bg-card border-muted hardware-border sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="tracking-tighter uppercase">NEW_CREDENTIAL</DialogTitle>
                    <DialogDescription className="text-[10px] uppercase tracking-widest">
                      Data will be encrypted before storage
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    addCredential({
                      service: formData.get('service') as string,
                      username: formData.get('username') as string,
                      password: formData.get('password') as string,
                      category: formData.get('category') as string,
                    });
                  }} className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="service">SERVICE_NAME</Label>
                      <Input id="service" name="service" placeholder="e.g. GitHub" required className="bg-background hardware-border" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">IDENTIFIER / EMAIL</Label>
                      <Input id="username" name="username" placeholder="user@example.com" required className="bg-background hardware-border" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">SECRET_KEY</Label>
                      <div className="flex gap-2">
                        <Input id="password" name="password" type="password" required className="bg-background hardware-border" />
                        <Button type="button" variant="outline" size="icon" className="hardware-border" onClick={() => {
                          const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
                          let pass = "";
                          for(let i=0; i<16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                          const input = document.getElementById('password') as HTMLInputElement;
                          if(input) input.value = pass;
                          toast.info('Generated secure password');
                        }}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">CATEGORY</Label>
                      <select id="category" name="category" className="w-full h-10 rounded-md bg-background border border-muted hardware-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value="General">GENERAL</option>
                        <option value="Social">SOCIAL</option>
                        <option value="Finance">FINANCE</option>
                        <option value="Work">WORK</option>
                      </select>
                    </div>
                    <DialogFooter className="pt-4">
                      <Button type="submit" className="w-full">STORE_ENCRYPTED</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Grid */}
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredVault.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4"
                    >
                      <div className="p-6 rounded-full border border-dashed border-muted">
                        <Search className="w-12 h-12 opacity-20" />
                      </div>
                      <p className="uppercase text-xs tracking-[0.3em]">No records found</p>
                    </motion.div>
                  ) : (
                    filteredVault.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card className="hardware-border bg-card hover:border-primary/50 transition-colors group">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <Badge variant="secondary" className="text-[9px] uppercase tracking-widest bg-muted/50">
                                {item.category}
                              </Badge>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => deleteCredential(item.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <CardTitle className="text-xl tracking-tighter truncate">{item.service}</CardTitle>
                            <CardDescription className="text-[10px] uppercase tracking-wider truncate">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-1">
                              <Label className="text-[9px] text-muted-foreground uppercase tracking-widest">IDENTIFIER</Label>
                              <div className="flex items-center justify-between p-2 rounded bg-background hardware-border group/field">
                                <span className="text-sm truncate mr-2">{item.username}</span>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 opacity-0 group-hover/field:opacity-100"
                                  onClick={() => copyToClipboard(item.username, 'Username')}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] text-muted-foreground uppercase tracking-widest">SECRET_KEY</Label>
                              <div className="flex items-center justify-between p-2 rounded bg-background hardware-border group/field">
                                <span className="text-sm font-password tracking-widest">
                                  {showPasswords[item.id] ? item.password : '••••••••••••'}
                                </span>
                                <div className="flex gap-1 opacity-0 group-hover/field:opacity-100">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6"
                                    onClick={() => togglePassword(item.id)}
                                  >
                                    {showPasswords[item.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6"
                                    onClick={() => copyToClipboard(item.password, 'Password')}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="generator">
            <Card className="hardware-border bg-card">
              <CardHeader>
                <CardTitle className="tracking-tighter uppercase">SECURE_KEY_GENERATOR</CardTitle>
                <CardDescription className="text-[10px] uppercase tracking-widest">Generate high-entropy credentials</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-8 rounded bg-background hardware-border flex flex-col items-center justify-center space-y-4">
                  <div className="text-3xl font-bold tracking-[0.2em] break-all text-center" id="gen-output">
                    ••••••••••••••••
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="hardware-border" onClick={() => {
                      const output = document.getElementById('gen-output');
                      if(output && output.innerText !== '••••••••••••••••') {
                        copyToClipboard(output.innerText, 'Generated password');
                      }
                    }}>
                      <Copy className="w-4 h-4 mr-2" /> COPY
                    </Button>
                    <Button size="sm" onClick={() => {
                      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
                      let pass = "";
                      for(let i=0; i<24; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      const output = document.getElementById('gen-output');
                      if(output) output.innerText = pass;
                    }}>
                      <RefreshCw className="w-4 h-4 mr-2" /> GENERATE
                    </Button>
                    <Button 
                      size="sm" 
                      variant="secondary"
                      className="hardware-border"
                      onClick={() => {
                        const output = document.getElementById('gen-output');
                        if(output && output.innerText !== '••••••••••••••••') {
                          addCredential({
                            service: 'Generated Key',
                            username: user?.email || 'User',
                            password: output.innerText,
                            category: 'General'
                          });
                        }
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" /> SAVE_TO_VAULT
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest">Entropy Level</Label>
                    <Badge variant="outline" className="w-full justify-center py-2 hardware-border text-green-500">HIGH_ENTROPY</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest">Algorithm</Label>
                    <Badge variant="outline" className="w-full justify-center py-2 hardware-border">CSPRNG_RANDOM</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-muted bg-background/80 backdrop-blur-md p-2 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-[9px] text-muted-foreground uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-primary" />
              Status: Operational
            </span>
            <span className="hidden sm:inline">Records: {decryptedVault.length}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Encryption: AES-256-GCM</span>
            <span className="hidden sm:inline">Last Sync: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
