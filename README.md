# DiabetEasy 🩸

A comprehensive diabetes management platform that helps users track glucose levels, manage meals, medications, exercise, and sleep patterns with AI-powered insights.

## 🚧 Moving off Base44: phase 1 backend (`api/`)

DiabetEasy's own backend lives in [`api/`](api/README.md). It is built with FastAPI and runs on PostgreSQL in production
or SQLite locally. It provides Sign in with Apple and Google, the 10 health data tables, photo uploads, Claude-powered
meal plans, exercise plans and insights, Libre and Fitbit sync, account deletion, the template-driven weekly insights
email (`api/app/templates/email/weekly_insights.txt.j2`) and a one-time Base44 copy script.

```bash
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt -r api/requirements-dev.txt
cd api && ../.venv/bin/alembic upgrade head && ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000/docs  ·  tests: cd api && ../.venv/bin/python -m pytest -q
```

## Phase 2: the web app runs on this API (no `@base44/sdk`)

- `src/api/client.js` is the dependency-free API client (in-memory access token, shared cookie refresh, `ApiError`,
  extra/created_date row adapter). Every component uses it; the AI cards call server-side tasks on `POST /api/v1/ai/{task}`.
- `/sign-in` (Sign in with Apple + Google), `/fitbit/callback`, and a first-run consent → profile step.
- Build-time identifiers (public, not secrets): `VITE_APPLE_SERVICES_ID`, `VITE_APPLE_REDIRECT_URI`, `VITE_GOOGLE_CLIENT_ID`
  (see `.env.example`). Local dev: proxy `/api` to `http://localhost:8000` in your Vite config.

```bash
npm test                     # node --test src/api/ infra/cloudfront/  (Node 20)
npm run lint
npm run check:contract       # entity-fields.json drift, client vs api/openapi.json, no @base44 references
npm run gen:entity-fields    # after regenerating api/openapi.json
```

Deploy: `.github/workflows/web.yml` (staging on merge to main, production by manual dispatch with approval).
Cutover from Base44 (write freeze, final copy, weekly job switch, retiring `base44/functions/`): [`docs/cutover.md`](docs/cutover.md).
Call-by-call mapping: `docs/phase2-call-inventory.md`.

## Phase 3: iPhone app (`ios/`)

A SwiftUI app on the same API: Apple/Google sign-in, all web screens in five tabs, Apple Health glucose import
(`POST /api/v1/glucose/import`), photo upload, Libre/Fitbit, privacy consent with AI permission, and in-app account
deletion. It is built and tested on GitHub's Macs; setup, TestFlight and App Store steps are in [`ios/README.md`](ios/README.md).

## 🌟 Features

### Core Functionality
- **📊 CGM Integration** - Connect to Freestyle Libre 2/3, Dexcom G6/G7, and other CGM devices for real-time glucose monitoring
- **🍽️ Smart Meal Planning** - AI-generated personalized meal plans based on dietary preferences and glucose patterns
- **💊 Medication Tracking** - Schedule and track medications with smart reminders
- **🏃 Exercise Logging** - Track workouts with AI-powered calorie estimation and glucose correlation
- **😴 Sleep Analysis** - Monitor sleep quality and its impact on glucose levels
- **📱 Wearable Integration** - Sync with Apple Health, Fitbit, Garmin, and other fitness trackers

### Intelligence & Insights
- **🤖 AI-Powered Recommendations** - Personalized insights based on your unique patterns
- **📈 Pattern Analysis** - Understand how meals, exercise, and sleep affect your glucose
- **⏰ Smart Reminders** - Context-aware notifications for meals, medications, and activities
- **📉 Trend Visualization** - Interactive charts showing glucose trends and correlations

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Shadcn/ui** - Beautiful component library
- **Recharts** - Data visualization
- **Framer Motion** - Smooth animations
- **TanStack Query** - Server state management

### Backend & Services
- **Deno Deploy** - Serverless functions
- **AI/ML Integration** - Smart recommendations and data analysis
- **RESTful API** - Custom backend services
- **Real-time Sync** - Live data updates

### Integrations
- Freestyle LibreLink
- Dexcom API
- Fitbit OAuth
- Apple Health
- Google Fit

## 📦 Installation

### Prerequisites
- Node.js 18+ or Deno
- npm or yarn

### Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/diabeteasy.git
cd diabeteasy
Install dependencies
npm install
Set up environment variables
cp .env.example .env
Configure your API keys in .env:
OPENAI_API_KEY=your_key_here
FITBIT_CLIENT_ID=your_client_id
FITBIT_CLIENT_SECRET=your_client_secret
Run the development server
npm run dev
🚀 Deployment
The application is optimized for deployment on modern platforms:

npm run build
npm run preview
📱 Usage
Getting Started
Sign Up - Create your account and complete the onboarding process
Set Up Profile - Enter your diabetes type, dietary preferences, and health goals
Connect Devices - Link your CGM and wearable devices
Start Tracking - Log meals, medications, and activities
Get Insights - Review AI-powered recommendations daily
Key Workflows
Quick Logging - Use AI to quickly log meals and exercises with automatic nutrition estimation
CGM Sync - Automatic glucose data sync from connected devices
Meal Planning - Generate weekly meal plans tailored to your needs
Pattern Analysis - Review correlations between activities and glucose levels
🏗️ Project Structure
diabeteasy/
├── components/          # Reusable UI components
│   ├── cgm/            # CGM integration components
│   ├── dashboard/      # Dashboard widgets
│   ├── glucose/        # Glucose tracking components
│   ├── insights/       # AI insights components
│   ├── logging/        # Quick logging forms
│   ├── meals/          # Meal planning components
│   └── ui/             # Base UI components
├── pages/              # Application pages
├── functions/          # Backend serverless functions
├── entities/           # Data models and schemas
└── utils/              # Helper functions
🔒 Privacy & Security
DiabetEasy takes data privacy seriously:

End-to-end encryption for health data
HIPAA compliance considerations
No data sharing with third parties
User data deletion on request
Secure API integrations
🤝 Contributing
Contributions are welcome! Please follow these steps:

Fork the repository
Create a feature branch (git checkout -b feature/AmazingFeature)
Commit your changes (git commit -m 'Add some AmazingFeature')
Push to the branch (git push origin feature/AmazingFeature)
Open a Pull Request
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

👨‍💻 Author
Naresh Babu Amperayani

⚠️ Disclaimer
DiabetEasy is designed to assist in diabetes management but is not a replacement for professional medical advice. Always consult with your healthcare provider about your diabetes management plan.

🙏 Acknowledgments
Built with empathy for the diabetes community
Inspired by real challenges in daily diabetes management
Powered by modern AI and cloud technologies
Note: This application is for informational purposes only and should not replace professional medical advice, diagnosis, or treatment.


## Phone app links (web bucket)

`public/.well-known/apple-app-site-association` and `public/.well-known/assetlinks.json` are copied to the web build root.
Before deploying, replace `TEAMID` with your Apple Team ID and `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with the SHA-256 of the
Play app-signing certificate. Serve apple-app-site-association as `application/json` without redirects and exclude `/.well-known/*`
from the SPA rewrite: `infra/cloudfront/spa-rewrite.js` is that CloudFront Function (cloudfront-js-2.0, viewer request).
The API enables Dexcom when `DEXCOM_CLIENT_ID`, `DEXCOM_CLIENT_SECRET`, `DEXCOM_BASE_URL` and `DEXCOM_REDIRECT_URIS` are set
(see `api/.env.example`); run `alembic upgrade head` to apply migration 0003. `public/app/index.html` is the `/app/*` fallback page. The real Dexcom tile appears only when
`GET /api/v1/me` lists `dexcom` in `integrations_available`; `/dexcom/callback` finishes the Dexcom login.
