# Phase 2a – Base44 call inventory and migration status

Produced with `grep -rn "base44\." src --include=*.jsx` (design step "call inventory").
`src/api/client.js` provides every target call below. **Status: all rows applied**; `src/api/base44Client.js`
is deleted and `node scripts/check-no-base44.mjs` keeps `@base44` out of the web app.
QuickWorkoutLog.jsx:30 uses the `workout-estimate` task and QuickFoodLog.jsx:138 the `food-nutrition` task
(both registered in api/app/ai/tasks.py). The built AI router takes photos as `file_keys: [key]` (not `file_key`).
Fitbit connect: no component in this snapshot triggers it; `startFitbitConnect()` in `src/api/session-logic.js`
is ready for the screen that does (open question).

| File:line | Old call | New call |
|---|---|---|
| Layout.jsx:26 | base44.auth.me | api.auth.me |
| DailyGlucoseTrendNotification.jsx:28,37,48,58 | entities.*.list | api.entities.*.list |
| DailyGlucoseTrendNotification.jsx:95 | Core.InvokeLLM | api.ai.run('daily-trend') |
| LifestyleRoutineAnalyzer.jsx:24,38,39,125 | entities list/create/update | api.entities.* |
| LifestyleRoutineAnalyzer.jsx:130 | Core.InvokeLLM | api.ai.run('routine-analysis', { routine }) |
| GlucoseTrendAnalysis.jsx:20,28,35 | entities.*.list | api.entities.*.list |
| GlucoseTrendAnalysis.jsx:61 | Core.InvokeLLM | api.ai.run('glucose-trends', { days }) |
| NutritionComparison.jsx:23,30 | entities.*.list | api.entities.*.list |
| NutritionComparison.jsx:103 | Core.InvokeLLM | api.ai.run('nutrition-comparison', { date }) |
| AIRecommendations.jsx:21-23 | entities.*.list | api.entities.*.list |
| AIRecommendations.jsx:79 | Core.InvokeLLM | api.ai.run('recommendations') |
| CGMIntegration.jsx:40 | functions.invoke | api.integrations.libre/fitbit.* (function name to confirm) |
| LibreConnect.jsx:25,33,98 | functions.invoke('connectLibre'/'syncLibreData') | api.integrations.libre.connect / sync (read result, not response.data) |
| MealPlanGenerator.jsx:33 | entities.GlucoseReading.list | api.entities.GlucoseReading.list |
| MealPlanGenerator.jsx:89 | Core.InvokeLLM | api.ai.run('meal-plan', { days, targetCalories, currency }) |
| PrivacyConsent.jsx:47,50 | UserProfile.list/update (consent_*) | api.entities.PrivacyConsent create/update |
| QuickWorkoutLog.jsx:30 | Core.InvokeLLM | **unmapped** – needs a new task (reported, not guessed) |
| QuickFoodLog.jsx:79 | Core.UploadFile | api.uploads.upload (after browser resize), save file_key |
| QuickFoodLog.jsx:83,138 | Core.InvokeLLM | api.ai.run('food-photo', { file_key }); line 138 to confirm |
| DailyJournal.jsx:32,39 | entities list/filter | api.entities.* |
| DailyJournal.jsx:55 | Core.UploadFile | api.uploads.upload, save file_key |
| DailyJournal.jsx:95 | Core.InvokeLLM | api.ai.run('journal-summary', { text, file_key }) |

Server status: all Phase 2 tasks are registered in api/app/ai/tasks.py.
