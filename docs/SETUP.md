# Setup

## Task 0 (owner setup): DONE

## Firebase project id

`play-oybc`

## iOS bundle id

`com.oybc.PlayOYBC`

- iOS app id: `1:793152912249:ios:9149dcf1ae797da5cdcda8`
- `GoogleService-Info.plist` goes to `ios/PlayOYBC/GoogleService-Info.plist` (gitignored).

## Web env keys

Web app id: `1:793152912249:web:f3a365d6f7e07238cdcda8`

Set in `web/.env.local` (gitignored); template in `web/.env.example`:

- `VITE_FIREBASE_API_KEY=`
- `VITE_FIREBASE_AUTH_DOMAIN=`
- `VITE_FIREBASE_PROJECT_ID=play-oybc`
- `VITE_FIREBASE_APP_ID=1:793152912249:web:f3a365d6f7e07238cdcda8`
- `VITE_USE_EMULATORS=` (`true` connects auth/firestore/functions emulators)

## Emulator commands

- Start all: `firebase emulators:start`
- (to fill in by later tasks)
