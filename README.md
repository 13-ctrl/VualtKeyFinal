# VaultKey: Zero-Knowledge Password Manager

VaultKey is a high-security, cloud-synced password manager built with a **Zero-Knowledge Architecture**. This means your sensitive data is encrypted on your device before it ever reaches the cloud. Even the database administrators cannot read your passwords.

## 🛡️ Security Architecture

### 1. Zero-Knowledge Principle
The application follows the "Zero-Knowledge" security model. Your **Master Password** is never sent to the server, stored in a database, or logged. It exists only in your browser's volatile memory during an active session.

### 2. Key Derivation (PBKDF2)
Human passwords are weak. We transform your Master Password into a cryptographically strong 256-bit key using:
- **Algorithm**: PBKDF2 (Password-Based Key Derivation Function 2).
- **Hash**: SHA-256.
- **Iterations**: 100,000 (Industry standard to prevent brute-force attacks).
- **Salt**: A unique, random 16-byte value generated per user.

### 3. Encryption (AES-256-GCM)
All data stored in the cloud is encrypted using:
- **Algorithm**: AES (Advanced Encryption Standard).
- **Key Length**: 256 bits.
- **Mode**: GCM (Galois/Counter Mode), providing both confidentiality and data integrity (tamper-proofing).
- **IV (Initialization Vector)**: A unique 12-byte random value generated for every single record.

---

## 🚀 Features

- **Cloud Sync**: Real-time synchronization across devices via Firebase Firestore.
- **Secure Authentication**: Email/Password login powered by Firebase Auth.
- **Hardware-Inspired UI**: A polished, "cyber-vault" aesthetic using Tailwind CSS and Framer Motion.
- **Key Generator**: Built-in high-entropy password generator with "Save to Vault" capability.
- **Real-Time Updates**: Instant UI updates when data changes in the cloud.
- **Responsive Design**: Fully functional on mobile and desktop.

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, TypeScript.
- **Styling**: Tailwind CSS, Lucide React (Icons).
- **Components**: Radix UI / Shadcn (Dialogs, Tabs, Cards).
- **Animation**: Framer Motion.
- **Backend**: Firebase (Authentication & Firestore).
- **Cryptography**: Web Crypto API (Native browser implementation).

---

## 📂 Project Structure

```text
├── src/
│   ├── lib/
│   │   ├── crypto.ts    # Core encryption/decryption logic
│   │   └── firebase.ts  # Firebase SDK initialization
│   ├── components/      # UI components (Buttons, Inputs, etc.)
│   └── App.tsx          # Main application logic and state
├── firestore.rules      # Security rules for database access
├── firebase-blueprint.json # Data schema definition
└── firebase-applet-config.json # Firebase project credentials
```

---

## 🛠️ Setup & Deployment

### 1. Firebase Configuration
To run this project, you need a Firebase project with:
1. **Authentication**: Enable the "Email/Password" provider.
2. **Firestore**: Create a database in "Production Mode".
3. **Rules**: Deploy the rules found in `firestore.rules`.

### 2. Local Development
```bash
npm install
npm run dev
```

### 3. Vercel Deployment
1. Push the code to GitHub.
2. Connect the repository to Vercel.
3. Add your Vercel URL to the **Authorized Domains** in the Firebase Console (Authentication > Settings).

---

## 📜 Database Schema (Firestore)

### `vaults/{userId}`
Stores the metadata required to derive the user's key.
- `salt`: Base64 encoded salt.
- `verifyCiphertext`: Encrypted string used to verify if the master password is correct.
- `verifyIv`: IV used for the verification string.

### `credentials/{id}`
Stores the actual encrypted records.
- `userId`: Owner's UID (for security filtering).
- `ciphertext`: The encrypted JSON object containing service, username, and password.
- `iv`: The unique IV for this specific record.
- `createdAt`: Timestamp.

---

## ⚖️ License
Educational Purpose - Zero-Knowledge Demonstration.
