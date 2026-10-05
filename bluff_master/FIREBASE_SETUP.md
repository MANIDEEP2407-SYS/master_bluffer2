# Firebase Setup Guide for Bluff Master

## Step 1: Firebase Project

The project uses Firebase project **bluff-master-61e30**.
If you're forking, create your own project and re-run `flutterfire configure`.

## Step 2: Enable Authentication

In Firebase Console → **Authentication** → **Sign-in method**, enable:

1. **Email/Password** — used for the register/login form
2. **Google** — used for "Continue with Google"
3. **Anonymous** — used for "Play as Guest"

## Step 3: Android App — SHA fingerprints (CRITICAL for Google Sign-In)

Google Sign-In on Android requires your signing certificate's SHA-1 and SHA-256
to be registered in the Firebase Console.

### Debug fingerprint
```bash
cd bluff_master/android
./gradlew signingReport
```
Look for `SHA1:` and `SHA-256:` under `Variant: debug`.

### Release fingerprint
```bash
keytool -list -v -keystore /path/to/your-release.jks -alias your-alias
```

**Add both** SHA-1 and SHA-256 hashes in:
Firebase Console → Project Settings → Your Android app → SHA certificate fingerprints

Then **re-download** `google-services.json` and replace `android/app/google-services.json`.
The new file should have an `oauth_client` section with your web client ID.

## Step 4: Firestore

1. In Firebase Console → **Firestore Database** → Create database
2. Start in **test mode** for development, or apply security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /rooms/{code} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 5: iOS (optional)

1. Add an iOS app in Firebase Console with bundle ID `com.example.bluffMaster`
2. Download `GoogleService-Info.plist` → place in `ios/Runner/`
3. In `ios/Runner/Info.plist`, replace `YOUR_IOS_CLIENT_ID` with the
   `REVERSED_CLIENT_ID` from `GoogleService-Info.plist`

## Step 6: Run

```bash
cd bluff_master
flutter clean
flutter pub get
flutter run
```
