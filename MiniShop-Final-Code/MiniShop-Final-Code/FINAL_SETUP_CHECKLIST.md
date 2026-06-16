# MiniShop Final Setup Checklist

This folder contains the MiniShop React Native / Expo app plus Firebase Cloud Functions.

## 1. Install mobile dependencies

```bash
npm install
npx expo start
```

## 2. Configure Firebase

Create a Firebase project and enable:

- Authentication: Email/Password
- Firestore Database
- Firebase Storage
- Firebase Cloud Functions

Copy `.env.example` to `.env` and fill in the Firebase public values.

## 3. Configure Stripe

Create 3 recurring Stripe prices and replace:

- `price_replace_starter`
- `price_replace_business`
- `price_replace_premium`

Use these plans:

- Starter: 5 photos
- Business: 10 photos
- Premium: 15 photos maximum

## 4. Configure Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

Add environment variables for:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

## 5. Deploy rules

```bash
firebase deploy --only firestore:rules,storage
```

## 6. Mobile build

For testing:

```bash
npx expo start
```

For store builds:

```bash
eas build -p ios
EAS build -p android
```

## Notes

MiniShop processes only owner subscriptions through Stripe. Customer product payments are handled outside the app between owner and customer.
